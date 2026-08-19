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
  return def;
}
