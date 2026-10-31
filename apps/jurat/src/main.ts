/**
 * @useaccord/jurat — composition root (milestone accord-g69g, bean accord-vruh).
 *
 * Agentic juror daemon for the Accord arbitration protocol: stakes into
 * attractive Subaccords, watches for its own seats being drawn, runs an LLM
 * agent over the dispute evidence, and votes commit/reveal — commit/reveal
 * sends gated behind JURAT_DRY_RUN (default on).
 *
 * main() wires the real seams: env config → chain client (SDK) → runtime
 * (scan loop + join gates + duty state machine) + WS hint layer + Telegram.
 */
import { mkdir } from "node:fs/promises";
import { setTimeout as sleep } from "node:timers/promises";
import type { Address } from "@solana/kit";
import {
  ACCORD_PROGRAM_ID,
  findAllDisputes,
  findAllSubaccords,
  findAssociatedTokenAddress,
  findJurorStakePda,
  findJurorStakesBySubaccord,
  findRoundPda,
  findSasAttestation,
  fetchDisputeMaybe,
  fetchJurorStakeMaybe,
  fetchRoundMaybe,
  fetchSubaccordMaybe,
  type Subaccord,
} from "@useaccord/sdk";
import { registerTelemetry, type Telemetry } from "ai";
import { DevToolsTelemetry } from "@ai-sdk/devtools";
import { OpenTelemetry } from "@ai-sdk/otel";

import { loadConfig } from "./config";
import { configureLogfire } from "./telemetry";

import {
  createChainClient,
  hotKeySeed,
  loadOperatorKeyBytes,
  operatorSignMessage,
} from "./chain/client";
import { readInveigoCase } from "./chain/inveigo";
import { makeTraceSinkBinder } from "./trace/sink";
import { subscribeAccordEvents } from "./chain/events";
import { joinSubaccord } from "./join/executor";
import {
  assembleDutyContext,
  createFileDeliveryKeyStorage,
  ensureJuratDeliveryKey,
} from "./duty/evidence";
import { makeLadderVerdictRunner } from "./agent/provider";
import { createTelegramChannel } from "./notify/telegram";
import type { NotifyChannel, VerdictNotice } from "./notify/channel";
import { fileDutyStore, fileVoteStore } from "./state/stores";
import {
  joinBudgetFromConfig,
  joinPolicyFromConfig,
  makeHintHandlers,
  makeWakeScheduler,
  runDaemon,
  type DaemonHandle,
  type RuntimeChain,
  type RuntimeDeps,
} from "./runtime";
import { logger } from "./log";

function log(message: string): void {
  logger.info(message);
}

/** No Telegram configured: verdicts + alerts go to stdout. */
function consoleChannel(): NotifyChannel {
  return {
    alert: async (message) => log(message),
    verdict: async (notice: VerdictNotice) => log(formatNotice(notice)),
  };
}

function formatNotice(notice: VerdictNotice): string {
  const voteLine = notice.dryRun ? "DRY RUN — no vote cast" : "LIVE — vote cast";
  return (
    `JURAT verdict — dispute ${notice.dispute} option ${notice.option} ` +
    `(${Math.round(notice.confidence * 100)}%) ${voteLine}: ${notice.rationale}`
  );
}

export async function main(): Promise<void> {
  const config = loadConfig();
  const telemetry: Telemetry[] = [];
  if (config.devtools) {
    // Local debug only: captures every generateText step (prompts, ⚒ tool
    // calls, responses) to .devtools/generations.json for the `ai-tools`
    // viewer (npx ai-tools@latest dev).
    telemetry.push(DevToolsTelemetry());
  }
  if (config.logfire) {
    // Pydantic Logfire (xeroc/inveigo): global OTel provider + AI SDK spans.
    // Token: LOGFIRE_TOKEN or .logfire/logfire_credentials.json.
    configureLogfire(config.logfireService);
    telemetry.push(new OpenTelemetry());
  }
  if (telemetry.length > 0) registerTelemetry(...telemetry);
  const chain = await createChainClient(config);
  const channel = config.telegram
    ? createTelegramChannel({
        botToken: config.telegram.token,
        chatId: config.telegram.chatId,
        onError: (e) => log(`telegram: ${e instanceof Error ? e.message : String(e)}`),
      })
    : consoleChannel();
  await mkdir(config.stateDir, { recursive: true });

  log(
    `jurat: booted rpc=${config.rpcUrl} operator=${chain.address} ` +
      `state=${config.stateDir} dryRun=${config.dryRun} ` +
      `scanInterval=${config.scanIntervalMs}ms devtools=${config.devtools} ` +
      `logfire=${config.logfire ? config.logfireService : "off"} ` +
      `llm=${config.llm.baseUrl} model=${config.llm.model}`,
  );

  // --- chain adapters over the SDK (single implementation, no second copy) ---

  const runtimeChain: RuntimeChain = {
    fetchSubaccords: async () =>
      (await findAllSubaccords(chain.rpc)).map((a) => ({
        address: a.address as Address,
        data: a.data,
      })),
    fetchDisputes: async () =>
      (await findAllDisputes(chain.rpc)).map((a) => ({
        address: a.address as Address,
        data: a.data,
      })),
    fetchRound: async (dispute, roundIdx) => {
      const [pda] = await findRoundPda({ dispute, roundIdx });
      const acc = await fetchRoundMaybe(chain.rpc, pda);
      return acc.exists ? acc.data : null;
    },
    fetchDispute: async (dispute) => {
      const acc = await fetchDisputeMaybe(chain.rpc, dispute);
      return acc.exists ? acc.data : null;
    },
    fetchJurorStake: async (subaccord, juror) => {
      const [pda] = await findJurorStakePda({ subaccord, juror });
      const acc = await fetchJurorStakeMaybe(chain.rpc, pda);
      return acc.exists ? { staked: acc.data.staked } : null;
    },
  };

  const joinChain = {
    programId: ACCORD_PROGRAM_ID,
    staking: chain.accord.adapter,
    fetchSubaccord: async (sub: Address) =>
      await fetchSubaccordMaybe(chain.rpc, sub).then((a) => (a.exists ? a.data : null)),
    fetchJurorStakes: async (sub: Address) =>
      (await findJurorStakesBySubaccord(chain.rpc, sub)).map((a) => ({
        address: a.address as Address,
        juror: a.data.juror,
        staked: a.data.staked,
        treeIndex: a.data.treeIndex,
        prevFree: a.data.prevFree,
        nextFree: a.data.nextFree,
      })),
    tokenBalance: async (owner: Address, mint: Address) => {
      const ata = await findAssociatedTokenAddress(mint, owner);
      // No ATA = never held the mint = zero balance. A raw
      // getTokenAccountBalance would throw "account not found" and kill the
      // whole scan on any foreign pool — the join pre-gate must degrade to 0.
      const info = await chain.rpc.getAccountInfo(ata, { encoding: "base64" }).send();
      if (info.value === null) return 0n;
      const res = await chain.rpc.getTokenAccountBalance(ata).send();
      return BigInt(res.value.amount);
    },
    solBalance: async (owner: Address) => (await chain.rpc.getBalance(owner).send()).value,
    findAttestation: (binding: Parameters<typeof findSasAttestation>[1]) =>
      findSasAttestation(chain.rpc, binding),
    send: (ix: Parameters<typeof chain.sendIx>[0]) => chain.sendIx(ix),
  };

  // --- evidence intake (optional: unset = verdict pipeline dark) ------------

  let assembleContext: RuntimeDeps["assembleContext"];
  if (config.evidence) {
    const { keypair } = await ensureJuratDeliveryKey({
      endpoint: config.evidence.endpoint,
      juror: chain.address,
      signMessage: operatorSignMessage(loadOperatorKeyBytes(config.keypairPath)),
      storage: createFileDeliveryKeyStorage(config.evidence.deliveryKeyPath),
    });
    log(
      `evidence: delivery key ${Buffer.from(keypair.publicKey).toString("hex").slice(0, 16)}… ready`,
    );
    const evidenceDeps = {
      endpoint: config.evidence.endpoint,
      deliveryKey: keypair,
      notify: (message: string) => channel.alert(message),
    };
    assembleContext = async (input) => {
      const sub: Subaccord | null = await joinChain.fetchSubaccord(input.subaccord as Address);
      const domainRef = sub ? Buffer.from(sub.domainRef).toString("hex") : undefined;
      return assembleDutyContext(
        evidenceDeps,
        {
          readDispute: (d) => runtimeChain.fetchDispute(d as Address),
          readSubaccord: (s) => joinChain.fetchSubaccord(s as Address),
          readCase: (d) =>
            readInveigoCase({
              rpc: chain.rpc,
              endpoint: evidenceDeps.endpoint,
              dispute: d as Address,
              expectedSubaccord: input.subaccord as Address,
            }),
        },
        { ...input, domainRef },
      );
    };
  } else {
    log(
      "evidence: NOT configured (JURAT_EVIDENCE_URL/JURAT_DELIVERY_KEY_PATH) — " +
        "duties will hold; no verdicts can be produced",
    );
  }

  // --- verdict runner: primary → fallback ladder ------------------------------

  const verdictRunner = makeLadderVerdictRunner(
    {
      name: "primary",
      baseURL: config.llm.baseUrl,
      apiKey: config.llm.apiKey,
      modelId: config.llm.model,
    },
    config.llmFallback && {
      name: "fallback",
      baseURL: config.llmFallback.baseUrl,
      apiKey: config.llmFallback.apiKey,
      modelId: config.llmFallback.model,
    },
  );

  // --- runtime + hint layer ----------------------------------------------------

  // Deadline wakes (commit-window open) ride the daemon's off-cycle scan.
  // The daemon is assigned just below — the closure only fires after start().
  const wake = { daemon: undefined as DaemonHandle | undefined };
  const wakeScheduler = makeWakeScheduler({ wake: () => wake.daemon?.kick() });

  const deps: RuntimeDeps = {
    juror: chain.address,
    stateDir: config.stateDir,
    dryRun: config.dryRun,
    policy: joinPolicyFromConfig(config),
    budget: joinBudgetFromConfig(config),
    chain: runtimeChain,
    join: (candidate) =>
      joinSubaccord(joinChain, {
        juror: chain.address,
        subaccord: candidate.subaccord,
        budget: joinBudgetFromConfig(config),
        stateDir: config.stateDir,
      }),
    store: fileDutyStore(config.stateDir),
    votes: fileVoteStore(config.stateDir),
    channel,
    verdict: (ctx) => verdictRunner.runVerdict(ctx),
    assembleContext,
    voting: {
      client: chain.accord.adapter,
      programId: ACCORD_PROGRAM_ID,
      send: (ix) => chain.sendIx(ix),
    },
    tokenBalance: joinChain.tokenBalance,
    scheduleWake: (key, wakeAtMs) => wakeScheduler.schedule(key, wakeAtMs),
    trace:
      config.trace &&
      makeTraceSinkBinder({
        url: config.trace.url,
        mode: config.trace.mode,
        juror: chain.address,
        seed: hotKeySeed(loadOperatorKeyBytes(config.keypairPath)),
      }),
    now: async () => Number((await chain.readClock()).unixTimestamp),
    log,
  };

  const abort = new AbortController();
  abort.signal.addEventListener("abort", () => wakeScheduler.dispose(), { once: true });
  const daemon = await runDaemon(deps, {
    intervalMs: config.scanIntervalMs,
    signal: abort.signal,
  });
  wake.daemon = daemon;

  // WS log hints: timely, never authoritative (accounts are the truth).
  // SeatDrawn is filtered to OUR juror (makeHintHandlers) — a duty received
  // is identified + alerted the moment the seat lands, then kicked.
  void (async () => {
    while (!abort.signal.aborted) {
      try {
        await subscribeAccordEvents(
          chain.rpcSubscriptions,
          ACCORD_PROGRAM_ID,
          makeHintHandlers({
            juror: chain.address,
            kick: () => daemon.kick(),
            alert: (message) => channel.alert(message),
            log,
          }),
          abort.signal,
        );
      } catch (e) {
        log(
          `hints: subscription failed (${e instanceof Error ? e.message : String(e)}) — retrying`,
        );
      }
      if (abort.signal.aborted) break;
      await sleep(config.scanIntervalMs, undefined, { signal: abort.signal }).catch(() => {});
    }
  })();

  const shutdown = (signal: string) => {
    log(`jurat: ${signal} — shutting down`);
    abort.abort();
    void daemon.stop().then(() => process.exit(0));
  };
  process.on("SIGINT", () => shutdown("SIGINT"));
  process.on("SIGTERM", () => shutdown("SIGTERM"));
}

// Entry when run directly (`bun run src/main.ts` / `pnpm start`).
if (import.meta.main) {
  await main();
}
