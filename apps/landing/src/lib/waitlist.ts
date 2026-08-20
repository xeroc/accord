// Waitlist submit seam — POSTs { email, type, timestamp } to the n8n webhook
// (VITE_N8N_WEBHOOK_URL), mirroring chainsquad.com's contract (routes on
// `type`). Pure-ish so the status strings + reset contract are testable.
export interface WaitlistResult {
  ok: boolean;
  message: string;
  /** true only on success — the caller resets the form. */
  reset: boolean;
}

export async function submitWaitlist(
  endpoint: string,
  email: string,
  fetchImpl: typeof fetch,
): Promise<WaitlistResult> {
  if (!endpoint) {
    return { ok: false, message: "Waitlist not wired yet — ping us on Telegram.", reset: false };
  }
  try {
    const res = await fetchImpl(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, type: "waitlist", timestamp: new Date().toISOString() }),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return { ok: true, message: "On the list. One email when v1 ships on mainnet.", reset: true };
  } catch {
    return { ok: false, message: "Couldn't reach the list — try Telegram.", reset: false };
  }
}
