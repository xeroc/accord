/**
 * Copyable — shortened string + copy-to-clipboard button.
 *
 * Renders `head…tail` in mono with a copy icon that writes the full value
 * to the clipboard. Used for every address, public key, and hash in the app.
 */
import { useState } from "react";
import { Check, Copy } from "lucide-react";

export function Copyable({
  value,
  head = 4,
  tail = 4,
  className = "",
}: {
  value: string;
  head?: number;
  tail?: number;
  className?: string;
}) {
  const [copied, setCopied] = useState(false);

  const display =
    value.length <= head + tail + 1
      ? value
      : `${value.slice(0, head)}…${value.slice(-tail)}`;

  async function copy(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // clipboard API can throw in insecure contexts — no-op.
    }
  }

  return (
    <span className={`inline-flex items-center gap-1.5 font-mono ${className}`}>
      <span>{display}</span>
      <button
        type="button"
        onClick={copy}
        className="relative text-text-secondary transition-colors hover:text-amber after:absolute after:-inset-3.5 after:content-['']"
        aria-label="Copy to clipboard"
      >
        {/* CSS cross-fade (no motion dep): both icons in DOM, one absolute overlay */}
        <span className="relative block size-3">
          <Copy
            className={`absolute inset-0 size-3 transition-[opacity,filter,scale] duration-300 [transition-timing-function:cubic-bezier(0.2,0,0,1)] ${
              copied
                ? "scale-[0.25] opacity-0 blur-[4px]"
                : "scale-100 opacity-100 blur-0"
            }`}
          />
          <Check
            className={`absolute inset-0 size-3 text-confirm transition-[opacity,filter,scale] duration-300 [transition-timing-function:cubic-bezier(0.2,0,0,1)] ${
              copied
                ? "scale-100 opacity-100 blur-0"
                : "scale-[0.25] opacity-0 blur-[4px]"
            }`}
          />
        </span>
      </button>
    </span>
  );
}
