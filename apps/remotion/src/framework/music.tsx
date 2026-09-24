import { useMemo, type FC } from "react";
import { Html5Audio, interpolate, useVideoConfig } from "remotion";

import type { MusicDefinition, VideoDefinition } from "./video";

const CLAMP = { extrapolateLeft: "clamp", extrapolateRight: "clamp" } as const;

/** Frame context — shaped so useVideoConfig() results slot in directly. */
export interface VolumeConfig {
  durationInFrames: number;
  fps: number;
}

/**
 * Builds the Remotion `volume` callback for a video's music: base level,
 * optional fade-in from 0, optional fade-out reaching exactly 0 at the
 * composition end. Where the legs overlap the quieter one wins. The
 * callback form is what lets Studio draw the volume curve in the timeline.
 */
export function buildMusicVolume(
  music: MusicDefinition,
  { durationInFrames, fps }: VolumeConfig,
): (frame: number) => number {
  const base = music.volume ?? 1;
  const fadeInFrames = (music.fadeIn ?? 0) * fps;
  const fadeOutFrames = (music.fadeOut ?? 1.5) * fps;
  const fadeOutFrom = durationInFrames - fadeOutFrames;
  return (frame: number) => {
    const legs: number[] = [];
    if (fadeInFrames > 0) {
      legs.push(interpolate(frame, [0, fadeInFrames], [0, 1], CLAMP));
    }
    if (fadeOutFrames > 0) {
      legs.push(interpolate(frame, [fadeOutFrom, durationInFrames], [1, 0], CLAMP));
    }
    return legs.length === 0 ? base : base * Math.min(...legs);
  };
}

/**
 * Wraps a video's component so Root can mount the declared music above it
 * — videos never render <Html5Audio> themselves, `music` in defineVideo is
 * the whole contract. With no music declared, returns the bare component.
 */
export function withMusic(video: VideoDefinition): FC<Record<string, unknown>> {
  if (!video.music) return video.component;
  const { component: VideoComponent, music } = video;
  const WithMusic: FC<Record<string, unknown>> = (props) => {
    const { durationInFrames, fps } = useVideoConfig();
    const volume = useMemo(
      () => buildMusicVolume(music, { durationInFrames, fps }),
      [music, durationInFrames, fps],
    );
    return (
      <>
        <VideoComponent {...props} />
        <Html5Audio src={music.src} volume={volume} />
      </>
    );
  };
  WithMusic.displayName = `WithMusic(${video.id})`;
  return WithMusic;
}
