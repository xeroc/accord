import type { FC } from "react";

/**
 * The per-video contract. Every videos/<slug>/index.ts(x) exports
 * `export const video = defineVideo({ ... })` — the sync CLI turns each
 * such dir into a static import in src/videos.gen.ts and Root.tsx mounts
 * one <Folder><Composition/></Folder> per entry.
 */

/** Remotion Folder/Composition ids allow letters, numbers, hyphens only. */
export const VIDEO_ID_RE = /^[a-zA-Z0-9-]+$/;

export interface VideoDefinition {
  /** Composition id (also the Studio sidebar folder name). */
  id: string;
  component: FC<Record<string, unknown>>;
  fps: number;
  width: number;
  height: number;
  durationInFrames: number;
  defaultProps?: Record<string, unknown>;
  /** Music + fades applied by the framework (see src/framework/music.tsx). */
  music?: MusicDefinition;
}

/** Background music mounted by Root above the video's component. */
export interface MusicDefinition {
  /** Audio source — pass staticFile("audio/<name>.wav"). */
  src: string;
  /** Base level 0–1; both fades scale it. Default 1. */
  volume?: number;
  /** Fade-in length in seconds from frame 0. Default 0. */
  fadeIn?: number;
  /** Fade-out length in seconds, hitting 0 at the composition end. Default 1.5. */
  fadeOut?: number;
}

export function defineVideo(def: VideoDefinition): VideoDefinition {
  if (!VIDEO_ID_RE.test(def.id)) {
    throw new Error(
      `video id '${def.id}' must match ${VIDEO_ID_RE.toString()} (Remotion composition constraint)`,
    );
  }
  if (def.durationInFrames < 1) {
    throw new Error(`video '${def.id}': durationInFrames must be >= 1`);
  }
  if (def.fps < 1) {
    throw new Error(`video '${def.id}': fps must be >= 1`);
  }
  if (def.music) {
    const { src, volume, fadeIn = 0, fadeOut = 1.5 } = def.music;
    if (!src) {
      throw new Error(`video '${def.id}': music.src must be a staticFile(...) string`);
    }
    if (volume !== undefined && (volume < 0 || volume > 1)) {
      throw new Error(`video '${def.id}': music.volume must be within [0, 1], got ${volume}`);
    }
    if (fadeIn < 0 || fadeOut < 0) {
      throw new Error(
        `video '${def.id}': music fades must be >= 0 (fadeIn ${fadeIn}s, fadeOut ${fadeOut}s)`,
      );
    }
    if ((fadeIn + fadeOut) * def.fps >= def.durationInFrames) {
      throw new Error(
        `video '${def.id}': music fades (${fadeIn + fadeOut}s) must leave unfaded room inside durationInFrames ${def.durationInFrames} @ ${def.fps}fps`,
      );
    }
  }
  return def;
}
