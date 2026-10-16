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
import { ed25519 } from "@noble/curves/ed25519";
import type { Address } from "@solana/kit";
import {
  ACCORD_PROGRAM_ID,
  findAllDisputes,
  findAllSubaccords,
  findAssociatedTokenAddress,
  findJurorStakesBySubaccord,
  findRoundPda,
  fetchDisputeMaybe,
  fetchRoundMaybe,
  fetchSubaccordMaybe,
  type Subaccord,
} from "@useaccord/sdk";

import { loadConfig } from "./config";
import { createChainClient, loadOperatorKeyBytes } from "./chain/client";
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
  runDaemon,
  type RuntimeChain,
  type RuntimeDeps,
} from "./runtime";

function log(message: string): void {
  console.log(`[${new Date().toISOString()}] ${message}`);
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
      `scanInterval=${config.scanIntervalMs}ms`,
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
      const res = await chain.rpc.getTokenAccountBalance(ata).send();
      return BigInt(res.value.amount);
    },
    solBalance: async (owner: Address) => (await chain.rpc.getBalance(owner).send()).value,
    send: (ix: Parameters<typeof chain.sendIx>[0]) => chain.sendIx(ix),
  };

  // --- evidence intake (optional: unset = verdict pipeline dark) ------------

  let assembleContext: RuntimeDeps["assembleContext"];
  if (config.evidence) {
    const { keypair } = await ensureJuratDeliveryKey({
      endpoint: config.evidence.endpoint,
      juror: chain.address,
      signMessage: (message) =>
        Promise.resolve(ed25519.sign(message, loadOperatorKeyBytes(config.keypairPath))),
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
    now: async () => Number((await chain.readClock()).unixTimestamp),
    log,
  };

  const abort = new AbortController();
  const daemon = await runDaemon(deps, {
    intervalMs: config.scanIntervalMs,
    signal: abort.signal,
  });

  // WS log hints: timely, never authoritative (accounts are the truth).
  void (async () => {
    while (!abort.signal.aborted) {
      try {
        await subscribeAccordEvents(
          chain.rpcSubscriptions,
          ACCORD_PROGRAM_ID,
          {
            onSubaccordCreated: () => daemon.kick(),
            onSeatDrawn: () => daemon.kick(),
            onRedrawn: () => daemon.kick(),
            onDisputeCreated: () => daemon.kick(),
            onError: (err) =>
              log(`hints: dropped event (${err instanceof Error ? err.message : String(err)})`),
          },
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
