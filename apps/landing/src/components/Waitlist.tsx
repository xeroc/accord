import { useState, type FormEvent } from "react";
import { Button } from "@useaccord/ui";

import { submitWaitlist } from "../lib/waitlist";

// Waitlist form — POSTs { email, type, timestamp } to VITE_N8N_WEBHOOK_URL
// (n8n webhook). Mirrors chainsquad.com's n8n contract (routes on `type`);
// anti-hype microcopy. Submit logic lives in ../lib/waitlist (testable seam).
const endpoint = import.meta.env.VITE_N8N_WEBHOOK_URL ?? "";

export function Waitlist() {
  const [email, setEmail] = useState("");
  const [sending, setSending] = useState(false);
  const [status, setStatus] = useState<{ msg: string; ok: boolean }>({ msg: "", ok: false });

  const onSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const value = email.trim();
    if (!value || sending) return;
    setSending(true);
    setStatus({ msg: "Sending…", ok: true });
    const res = await submitWaitlist(endpoint, value, fetch);
    setStatus({ msg: res.message, ok: res.ok });
    if (res.reset) setEmail("");
    setSending(false);
  };

  return (
    <form data-waitlist data-endpoint={endpoint} className="flex w-full max-w-md flex-col gap-2" noValidate onSubmit={onSubmit}>
      <div className="flex w-full flex-col gap-2 sm:flex-row">
        <input
          type="email"
          name="email"
          inputMode="email"
          autoComplete="email"
          required
          placeholder="you@protocol.xyz"
          aria-label="Email address"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="w-full flex-1 rounded-md border border-border bg-raised px-4 py-3 font-mono text-sm text-nearwhite placeholder:text-muted-foreground/60 focus:border-amber focus:outline-none"
        />
        <Button
          type="submit"
          disabled={sending}
          className="h-auto rounded-md px-5 py-3 font-sans"
        >
          Join the waitlist
        </Button>
      </div>
      <p
        data-waitlist-status
        role="status"
        aria-live="polite"
        className="w-full text-left text-xs text-muted-foreground"
        style={status.msg ? { color: status.ok ? "var(--color-confirm)" : "var(--color-slash)" } : undefined}
      >
        {status.msg}
      </p>
    </form>
  );
}
