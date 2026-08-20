import { describe, expect, it } from "vitest";

import { buildMusicVolume } from "./music";
import { defineVideo } from "./video";

const FPS = 30;
const DURATION = 900; // 30s @ 30fps — matches the intro composition
const CTX = { durationInFrames: DURATION, fps: FPS };
/** fadeOut must be pinned to 0 in "no fade" cases — 1.5s is the default. */
const NO_FADES = { src: "x.wav", fadeIn: 0, fadeOut: 0 };

describe("buildMusicVolume", () => {
  it("is constant base volume when both fades are 0", () => {
    const volume = buildMusicVolume(NO_FADES, CTX);
    expect(volume(0)).toBe(1);
    expect(volume(450)).toBe(1);
    expect(volume(DURATION - 1)).toBe(1);
  });

  it("ramps from 0 over fadeIn seconds, then holds", () => {
    const volume = buildMusicVolume({ ...NO_FADES, fadeIn: 1 }, CTX);
    expect(volume(0)).toBe(0);
    expect(volume(FPS / 2)).toBeCloseTo(0.5, 5);
    expect(volume(FPS)).toBe(1);
    expect(volume(2 * FPS)).toBe(1);
  });

  it("fades out over the last fadeOut seconds to exactly 0 at the end", () => {
    const volume = buildMusicVolume({ ...NO_FADES, fadeOut: 1.5 }, CTX); // 45 frames
    expect(volume(DURATION - 45)).toBe(1); // base until the fade starts
    expect(volume(DURATION - 30)).toBeCloseTo(30 / 45, 5);
    expect(volume(DURATION)).toBe(0); // silence at the composition edge
    expect(volume(DURATION - 1)).toBeLessThan(volume(DURATION - 2)); // monotone tail
  });

  it("takes the quieter leg where fadeIn and fadeOut overlap", () => {
    const short = { durationInFrames: 60, fps: FPS };
    const volume = buildMusicVolume({ ...NO_FADES, fadeIn: 1, fadeOut: 1 }, short);
    expect(volume(FPS)).toBe(1); // both legs meet at full
    expect(volume(15)).toBeCloseTo(0.5, 5); // fade-in leg wins
    expect(volume(45)).toBeCloseTo(0.5, 5); // fade-out leg wins
  });

  it("scales everything by the base volume", () => {
    const volume = buildMusicVolume({ ...NO_FADES, volume: 0.25, fadeIn: 1 }, CTX);
    expect(volume(0)).toBe(0);
    expect(volume(FPS / 2)).toBeCloseTo(0.125, 5);
    expect(volume(FPS)).toBe(0.25);
  });

  it("converts fade seconds to frames via fps", () => {
    const volume = buildMusicVolume({ ...NO_FADES, fadeIn: 1 }, { durationInFrames: 600, fps: 60 });
    expect(volume(0)).toBe(0);
    expect(volume(30)).toBeCloseTo(0.5, 5);
    expect(volume(60)).toBe(1);
  });

  it("applies a default 1.5s fade-out when none is given", () => {
    const volume = buildMusicVolume({ src: "x.wav" }, CTX);
    expect(volume(DURATION - 46)).toBe(1); // before the default leg
    expect(volume(DURATION)).toBe(0);
  });

  it("never dips below 0 or above the base volume", () => {
    const volume = buildMusicVolume(
      { src: "x.wav", fadeIn: 1, fadeOut: 1.5, volume: 0.4 },
      { durationInFrames: 120, fps: FPS },
    );
    for (let frame = 0; frame <= 120; frame++) {
      expect(volume(frame)).toBeGreaterThanOrEqual(0);
      expect(volume(frame)).toBeLessThanOrEqual(0.4);
    }
  });
});

describe("defineVideo music validation", () => {
  const base = {
    id: "music-test",
    component: () => null,
    fps: FPS,
    width: 1920,
    height: 1080,
    durationInFrames: DURATION,
  };

  it("round-trips a valid music definition", () => {
    const video = defineVideo({
      ...base,
      music: { src: "x.wav", volume: 0.25, fadeIn: 0.5, fadeOut: 2 },
    });
    expect(video.music).toEqual({ src: "x.wav", volume: 0.25, fadeIn: 0.5, fadeOut: 2 });
  });

  it("rejects volume outside [0, 1]", () => {
    expect(() => defineVideo({ ...base, music: { src: "x.wav", volume: 1.5 } })).toThrow(/volume/);
    expect(() => defineVideo({ ...base, music: { src: "x.wav", volume: -0.1 } })).toThrow(/volume/);
  });

  it("rejects negative fades", () => {
    expect(() => defineVideo({ ...base, music: { src: "x.wav", fadeIn: -1 } })).toThrow(/fade/);
    expect(() => defineVideo({ ...base, music: { src: "x.wav", fadeOut: -1 } })).toThrow(/fade/);
  });

  it("rejects fades that span the whole composition", () => {
    expect(() =>
      defineVideo({ ...base, music: { src: "x.wav", fadeIn: 15, fadeOut: 15.1 } }),
    ).toThrow(/durationInFrames/);
  });
});
