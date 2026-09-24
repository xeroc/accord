import { mkdir, readFile, readdir, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import * as webaudio from "node-web-audio-api";

/** src/cli → apps/remotion package root. */
const pkgRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

const DOUGH_SAMPLES = "https://raw.githubusercontent.com/felixroos/dough-samples/main";
const DEFAULT_SECONDS = 30;
const SAMPLE_RATE = 48_000; // video-standard; keeps the AAC encode resample-free

type Engine = typeof import("@strudel/web/dist/index.mjs");

let enginePromise: Promise<Engine> | null = null;

/**
 * Loads @strudel/web in Node, backed by node-web-audio-api. Must stay a
 * dynamic import: the engine touches browser globals (window/document) while
 * its module evaluates, so the shims have to be installed first — a static
 * import would hoist past them.
 */
function loadEngine(): Promise<Engine> {
  enginePromise ??= (async () => {
    globalThis.window ??= globalThis as unknown as Window & typeof globalThis;
    // Node's globalThis lacks the event-target API the engine expects on window.
    globalThis.addEventListener ??= () => { };
    globalThis.removeEventListener ??= () => { };
    // Minimal DOM for the engine's module init and its "download the wav"
    // finisher (renderPatternAudio appends and clicks an anchor).
    globalThis.document ??= {
      createElement: () => ({ click() { }, href: "", download: "" }),
      body: { appendChild() { }, removeChild() { } },
      addEventListener() { },
      removeEventListener() { },
      dispatchEvent() {
        return true;
      },
    } as unknown as Document;
    for (const [name, value] of Object.entries(webaudio)) {
      if (name === "default" || name === "mediaDevices" || name === "AudioContext") continue;
      if (!(name in globalThis)) Object.defineProperty(globalThis, name, { value });
    }
    // Headless machines have no audio device — force a null sink on every
    // realtime context the engine creates (constructor-return keeps `new`
    // working). OfflineAudioContext is untouched: it renders to a buffer.
    const NodeAudioContext = webaudio.AudioContext;
    type Ctor = new (options?: ConstructorParameters<typeof NodeAudioContext>[0]) => InstanceType<
      typeof NodeAudioContext
    >;
    const NullSinkAudioContext = function (this: unknown, options?: object) {
      return new NodeAudioContext({
        ...options,
        sinkId: { type: "none" },
      } as ConstructorParameters<typeof NodeAudioContext>[0]);
    } as unknown as Ctor;
    Object.defineProperty(globalThis, "AudioContext", { value: NullSinkAudioContext });
    return await import("@strudel/web/dist/index.mjs");
  })();
  return enginePromise;
}

export interface RenderScoreResult {
  name: string;
  wavPath: string;
  seconds: number;
  peak: number;
}

/** True when the artifact exists and is newer than its score. */
async function isFresh(name: string): Promise<boolean> {
  try {
    const [score, wav] = await Promise.all([
      stat(path.join(pkgRoot, "audio", `${name}.strudel`)),
      stat(path.join(pkgRoot, "public", "audio", `${name}.wav`)),
    ]);
    return wav.mtimeMs >= score.mtimeMs;
  } catch {
    return false;
  }
}

/**
 * Renders audio/<name>.strudel → public/audio/<name>.wav (gitignored
 * artifact). The wav is strudel's own output, relayed verbatim — mix level
 * and fades are authored in the score (.gain), never post-processed here.
 *
 * With `staleOnly`, resolves null instead of re-rendering a fresh artifact —
 * the mode `render`/`studio` chain in.
 */
export async function renderScore(
  name: string,
  {
    seconds = DEFAULT_SECONDS,
    staleOnly = false,
  }: { seconds?: number; staleOnly?: boolean } = {},
): Promise<RenderScoreResult | null> {
  if (staleOnly && (await isFresh(name))) return null;
  const score = await readFile(path.join(pkgRoot, "audio", `${name}.strudel`), "utf8");
  const cpm = score.match(/setcpm\(\s*([\d.]+)/)?.[1];
  if (!cpm) throw new Error(`score '${name}': no setcpm(...) found — tempo is required`);
  const cps = Number(cpm) / 60;

  const { initStrudel, evaluate, registerSynthSounds, renderPatternAudio, samples } =
    await loadEngine();
  await initStrudel({
    prebake: () =>
      Promise.all([
        registerSynthSounds(), // s("triangle"), .fm(), …
        samples("https://raw.githubusercontent.com/tidalcycles/uzu-drumkit/main/strudel.json"), // bd hh rim cp …
        samples(`${DOUGH_SAMPLES}/tidal-drum-machines.json`), // .bank("RolandTR909")
        samples(`${DOUGH_SAMPLES}/piano.json`), // s("piano")
        samples({
          // canon-family accent "pluck" — VCSL concert harp (sgossner),
          // the closest plucked string to the REPL's default pluck, which
          // dough-samples does not mirror (Dirt-Samples.json has none).
          // Note map verbatim from dough-samples vcsl.json, spaces %20-encoded.
          _base: "https://raw.githubusercontent.com/sgossner/VCSL/master/",
          pluck: {
            A2: "Chordophones/Composite%20Chordophones/Concert%20Harp/KSHarp_A2_mf1.wav",
            A4: "Chordophones/Composite%20Chordophones/Concert%20Harp/KSHarp_A4_mf1.wav",
            A6: "Chordophones/Composite%20Chordophones/Concert%20Harp/KSHarp_A6_mf1.wav",
            B1: "Chordophones/Composite%20Chordophones/Concert%20Harp/KSHarp_B1_mf1.wav",
            B3: "Chordophones/Composite%20Chordophones/Concert%20Harp/KSHarp_B3_mf1.wav",
            B5: "Chordophones/Composite%20Chordophones/Concert%20Harp/KSHarp_B5_mf1.wav",
            B6: "Chordophones/Composite%20Chordophones/Concert%20Harp/KSHarp_B6_mf1.wav",
            C3: "Chordophones/Composite%20Chordophones/Concert%20Harp/KSHarp_C3_mf3.wav",
            C5: "Chordophones/Composite%20Chordophones/Concert%20Harp/KSHarp_C5_mf1.wav",
            D2: "Chordophones/Composite%20Chordophones/Concert%20Harp/KSHarp_D2_mf1.wav",
            D4: "Chordophones/Composite%20Chordophones/Concert%20Harp/KSHarp_D4_mf1.wav",
            D6: "Chordophones/Composite%20Chordophones/Concert%20Harp/KSHarp_D6_mf1.wav",
            D7: "Chordophones/Composite%20Chordophones/Concert%20Harp/KSHarp_D7_p1.wav",
            E1: "Chordophones/Composite%20Chordophones/Concert%20Harp/KSHarp_E1_f1.wav",
            E3: "Chordophones/Composite%20Chordophones/Concert%20Harp/KSHarp_E3_mf1.wav",
            E5: "Chordophones/Composite%20Chordophones/Concert%20Harp/KSHarp_E5_mf1.wav",
            F2: "Chordophones/Composite%20Chordophones/Concert%20Harp/KSHarp_F2_mf1.wav",
            F4: "Chordophones/Composite%20Chordophones/Concert%20Harp/KSHarp_F4_mf1.wav",
            F6: "Chordophones/Composite%20Chordophones/Concert%20Harp/KSHarp_F6_mf1.wav",
            F7: "Chordophones/Composite%20Chordophones/Concert%20Harp/KSHarp_F7_p1.wav",
            G1: "Chordophones/Composite%20Chordophones/Concert%20Harp/KSHarp_G1_mp1.wav",
            G3: "Chordophones/Composite%20Chordophones/Concert%20Harp/KSHarp_G3_mf1.wav",
            G5: "Chordophones/Composite%20Chordophones/Concert%20Harp/KSHarp_G5_mf1.wav",
          },
        }), // s("pluck")
      ]),
  });
  const pattern = await evaluate(score, false);

  // Relay strudel's wav verbatim: renderPatternAudio encodes the PCM16 file
  // and hands it to URL.createObjectURL before triggering its (shimmed)
  // anchor-click "download". Capture the blob, change nothing.
  const URLCtor = URL as unknown as { createObjectURL: (blob: Blob) => string };
  const originalCreateObjectURL = URLCtor.createObjectURL;
  const captured: { blob?: Blob } = {};
  URLCtor.createObjectURL = (candidate: Blob) => {
    captured.blob ??= candidate;
    return originalCreateObjectURL.call(URLCtor, candidate);
  };
  try {
    await renderPatternAudio(pattern, cps, 0, seconds * cps, SAMPLE_RATE, 64, false);
  } finally {
    URLCtor.createObjectURL = originalCreateObjectURL;
  }
  const wavBlob = captured.blob;
  if (!wavBlob) throw new Error(`score '${name}': strudel produced no wav`);
  const wav = Buffer.from(await wavBlob.arrayBuffer());

  // Validation only — the bytes are not modified. A silent render fails
  // loudly; a full-scale peak means the score's mix clips and its master
  // .gain should come down.
  const view = new DataView(wav.buffer, wav.byteOffset, wav.byteLength);
  let peak = 0;
  for (let offset = 44; offset + 1 < wav.byteLength; offset += 2) {
    const sample = Math.abs(view.getInt16(offset, true)) / 32_768;
    if (sample > peak) peak = sample;
  }
  if (peak < 1e-4) throw new Error(`score '${name}': rendered wav is silent (peak ${peak})`);
  if (peak >= 0.999) {
    console.warn(`[score:${name}] peak ${peak.toFixed(3)} — clipped; lower the score's master .gain`);
  }

  const outDir = path.join(pkgRoot, "public", "audio");
  await mkdir(outDir, { recursive: true });
  const wavPath = path.join(outDir, `${name}.wav`);
  await writeFile(wavPath, wav);
  return { name, wavPath, seconds, peak };
}

/**
 * Renders every audio/*.strudel (skipping fresh ones in staleOnly mode).
 * Note: multiple renders share one engine instance; a silent result fails
 * loudly via the peak guard rather than writing a muted wav.
 */
export async function renderAllScores(
  options: { seconds?: number; staleOnly?: boolean } = {},
): Promise<(RenderScoreResult | null)[]> {
  const results: (RenderScoreResult | null)[] = [];
  for (const entry of await readdir(path.join(pkgRoot, "audio"))) {
    if (!entry.endsWith(".strudel")) continue;
    results.push(await renderScore(entry.replace(/\.strudel$/, ""), options));
  }
  return results;
}
