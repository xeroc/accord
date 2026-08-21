/**
 * queryClient — the app-wide TanStack Query client singleton.
 *
 * Lives here (not in main.tsx) so non-component modules — notably
 * `sendInstruction` — can invalidate queries after a transaction confirms.
 * Without that, post-tx screens render pre-tx cache: an appealed dispute
 * looks unappealed, a committed vote form stays open (apple-design audit C1).
 */
import { QueryClient } from "@tanstack/react-query";

export const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: 1, refetchOnWindowFocus: false } },
});
