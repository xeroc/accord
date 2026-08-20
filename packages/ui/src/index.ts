/**
 * @useaccord/ui — shared design system for the Accord applications.
 *
 * Public surface policy: only symbols with real consumers are exported.
 * `cn`, `buttonVariants`, and `badgeVariants` stay module-internal (no app
 * call sites use them; re-export deliberately if that changes).
 *
 * Boundary rules (enforced by review + grep, see README):
 * no Solana, no router, no query client, no SDK types, no import.meta.env.
 */
export {
  Alert,
  AlertTitle,
  AlertDescription,
  AlertAction,
} from "./primitives/alert";
export { Badge } from "./primitives/badge";
export { Button } from "./primitives/button";
export {
  Card,
  CardHeader,
  CardFooter,
  CardTitle,
  CardAction,
  CardDescription,
  CardContent,
} from "./primitives/card";
export { Copyable } from "./primitives/copyable";
export {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogOverlay,
  DialogPortal,
  DialogTitle,
  DialogTrigger,
} from "./primitives/dialog";
export { Input } from "./primitives/input";
export { Label } from "./primitives/label";
export {
  Field,
  FieldControl,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
  useField,
} from "./primitives/field";
export { Spinner } from "./primitives/spinner";
export { Textarea } from "./primitives/textarea";
export { MarkdownText } from "./primitives/markdown-text";
export {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectScrollDownButton,
  SelectScrollUpButton,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
} from "./primitives/select";
export { Separator } from "./primitives/separator";
export { Skeleton } from "./primitives/skeleton";
export { Toaster } from "./primitives/toaster";
export {
  Table,
  TableHeader,
  TableBody,
  TableFooter,
  TableHead,
  TableRow,
  TableCell,
  TableCaption,
} from "./primitives/table";

// Motion — choreographed enter/exit primitives.
export { StaggerGroup, StaggerItem, Reveal, ErrorShake, EASE_EXPO } from "./motion";
// Composed patterns — slot-based app chrome; still boundary-clean
// (no router/wallet/SDK/env imports, see header policy).
export { ProductNavbar } from "./patterns/product-navbar";
export { PageTransition } from "./patterns/page-transition";
export { EmptyState } from "./patterns/empty-state";
export { PageShell } from "./patterns/page-shell";
export { ErrorState } from "./patterns/error-state";
export { DepthPicker } from "./patterns/depth-picker";
export { DisputeStatusCard } from "./patterns/dispute-status-card";
export {
  DomainDocCard,
  DOMAIN_DOC_TEMPLATE,
  type DomainDoc,
} from "./patterns/domain-doc-card";

// Brand — the house identity: the Accord mark and wordmark lockup.
// Progress-driven (0→1), static-capable defaults.
export { AccordMark } from "./brand/accord-mark";
export { Wordmark } from "./brand/wordmark";
export { AmberRule } from "./brand/amber-rule";

// Mechanism — the frame-contract vocabulary: everything that renders
// as a pure function of a `frame` counter (caller owns time). Remotion
// feeds useCurrentFrame(); browsers useWallClockFrame(). Includes the
// ambient Backdrop and the wall-clock driver.
export { Backdrop } from "./mechanism/backdrop";
export { useNow } from "./mechanism/clock";
export { useWallClockFrame } from "./mechanism/clock";
export { JurorPool } from "./mechanism/juror-pool";
export { SealedVote } from "./mechanism/sealed-vote";
export { RulingStamp } from "./mechanism/ruling-stamp";
export { MonoChip, DeltaChip, type ChipTone } from "./mechanism/chips";
export { TallyBar } from "./mechanism/tally";
// Mechanism additions — the concept-illustration vocabulary (groups
// A–F): ledger strip, subaccord container, vaults, counters, ladder,
// lifecycle, accumulator, sortition. Same frame contract; see
// concept-illustrations/ui-kit-additions.md for the full reference.
export { TokenBadge, TOKEN_TONE, type TokenTone } from "./mechanism/token-tone";
export { ChainStrip } from "./mechanism/chain-strip";
export { SubaccordCard, SUBACCORD_INTERNALS } from "./mechanism/subaccord-card";
export { VaultBox } from "./mechanism/vault-box";
export { LedgerCounter, type LedgerTone } from "./mechanism/ledger-counter";
export { PanelLadder, PANEL_LADDER } from "./mechanism/panel-ladder";
export { StateNode } from "./mechanism/state-node";
export { MerkleSumTree } from "./mechanism/merkle-sum-tree";
export { SortitionRuler } from "./mechanism/sortition-ruler";
