// The app is not Vite (no vite/client types), so declare the CSS module
// shape ourselves. Only src/index.ts imports CSS (the theme entry).
declare module "*.css";

// @strudel/web ships no types; the slice its CLI consumer uses is declared
// here. Imported dynamically (after browser-global shims) by src/cli/score.ts.
declare module "@strudel/web/dist/index.mjs" {
  export const initStrudel: (options?: { prebake?: () => unknown }) => Promise<unknown>;
  /** Evaluate REPL-style code (double quotes = mini-notation); resolves to the pattern. */
  export const evaluate: (code: string, asPattern?: boolean) => Promise<object>;
  export const aliasBank: (manifestUrl: string) => Promise<unknown>;
  export const samples: (manifestUrl: string) => Promise<unknown>;
  export const registerSynthSounds: () => Promise<unknown>;
  export const renderPatternAudio: (
    pattern: object,
    cps: number,
    from: number,
    to: number,
    sampleRate: number,
    maxPolyphony: number,
    multiChannelOrbits: boolean,
    filename?: string,
  ) => Promise<unknown>;
}
