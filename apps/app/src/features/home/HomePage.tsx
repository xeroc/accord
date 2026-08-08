/**
 * Home — landing route (`/`).
 *
 * Presents every dApp destination as a card (headline, description, goto
 * button) in the brand `.grid`/`.card`/`.cta` system. Each card is a full
 * Link; the `.cta` span is the visible goto affordance. Reuses existing
 * brand classes + Tailwind color tokens — no new CSS.
 */
import { Link } from "react-router-dom";

const OPTIONS = [
  {
    to: "/disputes",
    title: "Disputes",
    description:
      "Every dispute filed on the Accord. Track state, votes, and rulings.",
    action: "Browse disputes",
  },
  {
    to: "/disputes/new",
    title: "File a dispute",
    description: "Open a new dispute. Pay the fee. Let the Accord draw jurors.",
    action: "File a dispute",
  },
  {
    to: "/subaccords",
    title: "Subaccords",
    description: "Stake pools adjudicating one class of dispute.",
    action: "Browse subaccords",
  },
  {
    to: "/subaccords/new",
    title: "Create a subaccord",
    description:
      "Spin up an arbitration pool. Configure jurors, tokens, and windows.",
    action: "Create a subaccord",
  },
] as const;

export function HomePage() {
  return (
    <div>
      <header className="mb-8">
        <h1 className="text-2xl font-semibold tracking-tight">Accord.</h1>
        <p className="mt-1 text-text-secondary">
          Schelling-point arbitration on Solana. Pick where to go.
        </p>
      </header>

      <ul className="grid">
        {OPTIONS.map((o) => (
          <li key={o.to}>
            <Link to={o.to} className="card">
              <h2 className="text-base font-semibold tracking-tight">
                {o.title}.
              </h2>
              <p className="mt-1 mb-4 text-sm text-text-secondary">
                {o.description}
              </p>
              <span className="cta">{o.action} →</span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
