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
export { Alert, AlertTitle, AlertDescription, AlertAction } from "./primitives/alert";
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
export { PageShell } from "./patterns/page-shell";
export { DisputeStatusCard } from "./patterns/dispute-status-card";
