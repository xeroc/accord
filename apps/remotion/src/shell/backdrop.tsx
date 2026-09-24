import { useCurrentFrame } from "remotion";
import { Backdrop as KitBackdrop } from "@useaccord/ui";

/**
 * Backdrop — the video adapter over the kit's frame-driven Backdrop
 * (@useaccord/ui): Remotion supplies the frame counter, the kit owns
 * the layers. `seed` varies the node field per scene so hard cuts feel
 * fresh. All determinism lives in the kit (pure function of frame).
 */
export function Backdrop({ seed }: { seed: string }) {
  const frame = useCurrentFrame();
  return <KitBackdrop frame={frame} seed={seed} />;
}
