/**
 * DepthPicker — the juror-seat capacity Select shared by every create-flow
 * that sizes an MST stake pool (Accord subaccords, Canon backing courts).
 *
 * Depths map to seat counts (2^depth); the curated ladder trades raw numbers
 * for what the creator actually decides: how many juror seats the pool holds.
 * The ladder trims to `maxDepth` (the target program's tx-size bound — the
 * kit takes it as a prop to stay SDK-free) and the highest available option
 * is relabeled "… — max".
 */
import {
  Field,
  FieldControl,
  FieldDescription,
  FieldLabel,
} from "../primitives/field";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../primitives/select";

/** Curated ladder up to the largest browser-safe depth (16 → 65,536 seats).
 * A maxDepth below 4 leaves no options — every real program bound is ≥ 8. */
const LADDER = [
  { depth: 4, note: "16 seats — testing" },
  { depth: 6, note: "64 seats — small pool" },
  { depth: 8, note: "256 seats" },
  { depth: 10, note: "1,024 seats" },
  { depth: 12, note: "4,096 seats — recommended" },
  { depth: 14, note: "16,384 seats — large" },
  { depth: 16, note: "65,536 seats — max" },
] as const;

export function DepthPicker({
  value,
  onChange,
  maxDepth = 16,
}: {
  /** Selected depth as a string (form-state convention). */
  value: string;
  onChange: (v: string) => void;
  /** Highest depth the target program accepts. */
  maxDepth?: number;
}) {
  const options = LADDER.filter((o) => o.depth <= maxDepth).map((o, i, arr) =>
    i === arr.length - 1 && o.depth < 16 ? { ...o, note: `${o.note} — max` } : o,
  );

  return (
    <Field>
      <FieldLabel>Pool capacity.</FieldLabel>
      <FieldControl>
        <Select value={value} onValueChange={onChange}>
          <SelectTrigger className="w-full" aria-label="Pool capacity">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {options.map((opt) => (
              <SelectItem key={opt.depth} value={opt.depth.toString()}>
                {opt.note}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </FieldControl>
      <FieldDescription>
        Maximum juror seats (2^depth). Irreversible — set once at creation.
        Each stake/unstake tx carries a Merkle proof proportional to depth —
        depths beyond {maxDepth} exceed the 1232-byte transaction limit in
        browser wallets.
      </FieldDescription>
    </Field>
  );
}
