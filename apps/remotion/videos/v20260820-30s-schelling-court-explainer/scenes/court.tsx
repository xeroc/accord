import { EASE_EXPO } from "../../../src/shell/presets";
import { interpolate, useCurrentFrame } from "remotion";


import { Backdrop } from "./backdrop";
import {
  BEAT,
  JURORS,
  LAYOUT,
  ZOOM_ORIGIN,
  cardCenterX,
} from "./timeline";
import {
  Coin,
  Headline,
  JurorCard,
  Pool,
  Pot,
  Stamp,
  Tally,
  Vault,
  type Pt,
} from "./pieces";

/**
 * CourtScene — the illustration, one continuous take. No slides, no
 * chrome. The camera starts wide on the pool, the draw pops five
 * jurors, the pool fades, and the camera zooms into the seated jury
 * for the rest of the story.
 *
 * Spatial language (consistent on purpose):
 *   - the fee arrives from above (vault -> jurors)
 *   - reward rises (pot -> coherent jurors)
 *   - the Ruling stamps down the center while the court recedes
 */
export function CourtScene() {
  const frame = useCurrentFrame();
  const zoom = interpolate(frame, [BEAT.zoomAt, BEAT.zoomAt + 24], [0.85, 1.12], {
    easing: EASE_EXPO,
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  const vaultPt: Pt = { x: 960, y: LAYOUT.vaultY + 24 };
  const potPt: Pt = { x: 960, y: LAYOUT.potY + 14 };
  const cardSink = (i: number): Pt => ({
    x: cardCenterX(i),
    y: LAYOUT.juryY + LAYOUT.cardH - 26,
  });

  return (
    <div className="relative h-full w-full">
      <Backdrop seed="schelling" />
      <div
        className="absolute inset-0"
        style={{ transform: `scale(${zoom})`, transformOrigin: ZOOM_ORIGIN }}
      >
        <Pool />
        {JURORS.map((juror, i) => (
          <JurorCard key={juror.short} juror={juror} i={i} />
        ))}

        {/* fee — the vault pays every drawn juror */}
        {JURORS.map((juror, i) => (
          <Coin key={`fee-${juror.short}`} from={vaultPt} to={cardSink(i)} at={BEAT.feeCoinAt(i)} />
        ))}

        {/* profit — the pot rises to the coherent majority */}
        {JURORS.map((juror, i) =>
          juror.coherent ? (
            <Coin
              key={`profit-${juror.short}`}
              from={potPt}
              to={cardSink(i)}
              at={BEAT.profitCoinAt(i)}
            />
          ) : null,
        )}

        <Vault />
        <Pot />
        <Tally />
        <Stamp />
      </div>
      <Headline />
    </div>
  );
}
