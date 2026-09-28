#!/bin/sh
# Generate apps/docs/docs/reference/coverage.md — the instruction × test-suite
# evidence matrix. Every instruction declared in programs/<p>/src/lib.rs is
# cross-referenced against the suites that invoke it:
#   - LiteSVM unit tests  programs/<p>/tests/*_litesvm.rs
#   - host unit tests     programs/<p>/src/tests.rs
#   - jest e2e specs      tests/src/*.spec.ts
# A cell lists the files whose source references the instruction symbol —
# never hand-edit the output; regenerate with `make coverage`.
set -eu
ROOT=$(cd "$(dirname "$0")/.." && pwd)
OUT="$ROOT/apps/docs/docs/reference/coverage.md"

gen_program() {
  p=$1
  echo "## $p"
  echo
  echo "| Instruction | LiteSVM unit | Host unit | e2e spec |"
  echo "| --- | --- | --- | --- |"
  ixs=$(grep -o 'pub fn [a-z_0-9]*' "$ROOT/programs/$p/src/lib.rs" | sed 's/pub fn //' | sort -u)
  for ix in $ixs; do
    litesvm=$(grep -lw "$ix" "$ROOT"/programs/$p/tests/*_litesvm.rs 2>/dev/null | sed 's|.*/||;s|_litesvm.rs||' | paste -sd, -)
    if grep -qw "$ix" "$ROOT/programs/$p/src/tests.rs" 2>/dev/null; then host="tests.rs"; else host="—"; fi
    e2e=$(grep -lw "$ix" "$ROOT"/tests/src/*.spec.ts 2>/dev/null | sed 's|.*/||;s|\.spec\.ts||' | paste -sd, -)
    [ -n "$litesvm" ] || litesvm="—"
    [ -n "$e2e" ] || e2e="—"
    echo "| \`$ix\` | $litesvm | $host | $e2e |"
  done
  echo
}

{
  echo "# Test Coverage"
  echo
  echo "> **Generated — do not hand-edit.** Regenerate with \`make coverage\`"
  echo "> (\`scripts/gen-coverage.sh\`). A cell lists the test files whose source"
  echo "> references the instruction symbol, so it is evidence of invocation, not"
  echo "> a statement of branch coverage. \`—\` means no suite references the"
  echo "> instruction by name (e.g. CPI callbacks driven through their oracle)."
  echo
  gen_program accord
  gen_program canon
  gen_program synod
} > "$OUT"

echo "wrote $OUT"
