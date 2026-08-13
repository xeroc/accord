/**
 * Home — landing route (`/`).
 *
 * Three category boxes, each with a colored header strip and its action
 * cards. Distinct accent colours signal the three roles in the protocol:
 *   Disputes   → amber   (the core primitive)
 *   Jurors     → green   (staking / participation)
 *   SubAccords → sky     (the pool layer)
 *
 * Card class strings are full literals so Tailwind's scanner detects them.
 */
import { Link } from "react-router-dom";
import {
  LuArrowRight,
  LuFilePlus,
  LuFolderPlus,
  LuLayers,
  LuSearch,
  LuUsers,
  LuWallet,
} from "react-icons/lu";

const GROUPS = [
  {
    title: "Disputes",
    tagline: "Resolve conflicts on-chain.",
    cardClass: "bg-amber/5 hover:bg-amber/10",
    titleClass: "text-amber",
    items: [
      {
        to: "/disputes",
        label: "Browse",
        desc: "Every dispute filed on the Accord. Track state, votes, rulings.",
        icon: LuSearch,
      },
      {
        to: "/disputes/new",
        label: "File",
        desc: "Open a new dispute. Pay the fee. Let the Accord draw jurors.",
        icon: LuFilePlus,
      },
    ],
  },
  {
    title: "Jurors",
    tagline: "Stake collateral. Get drawn. Earn fees.",
    cardClass: "bg-confirm/5 hover:bg-confirm/10",
    titleClass: "text-confirm",
    items: [
      {
        to: "/juror/browse",
        label: "Browse",
        desc: "See who's staked where across every subaccord.",
        icon: LuUsers,
      },
      {
        to: "/juror",
        label: "Manage",
        desc: "Your stakes, active draws, and earned fees.",
        icon: LuWallet,
      },
    ],
  },
  {
    title: "SubAccords",
    tagline: "Arbitration pools for one class of dispute.",
    cardClass: "bg-sky-400/5 hover:bg-sky-400/10",
    titleClass: "text-sky-400",
    items: [
      {
        to: "/subaccords",
        label: "Browse",
        desc: "Stake pools adjudicating one class of dispute.",
        icon: LuLayers,
      },
      {
        to: "/subaccords/new",
        label: "Create",
        desc: "Spin up a pool. Configure jurors, tokens, and windows.",
        icon: LuFolderPlus,
      },
    ],
  },
] as const;

export function HomePage() {
  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Accord.</h1>
        <p className="mt-1 text-text-secondary">
          Schelling-point arbitration on Solana. Pick where to go.
        </p>
      </header>

      {GROUPS.map((group) => (
        <section
          key={group.title}
          className="overflow-hidden rounded-lg border border-border-subtle bg-raised"
        >
          <div className="border-b border-border-subtle px-5 py-3">
            <h2
              className={`font-mono text-sm font-semibold ${group.titleClass}`}
            >
              {group.title}
            </h2>
            <p className="mt-0.5 text-xs text-text-secondary">
              {group.tagline}
            </p>
          </div>
          <div className="divide-y divide-border-subtle">
            {group.items.map((item) => (
              <Link
                key={item.to}
                to={item.to}
                className={`group flex items-center gap-3 px-5 py-4 transition-colors ${group.cardClass}`}
              >
                <item.icon
                  className={`h-4 w-4 shrink-0 ${group.titleClass}`}
                />
                <div className="flex-1">
                  <span className="text-sm font-medium">
                    {item.label}
                  </span>
                  <p className="mt-1 text-xs text-text-secondary">
                    {item.desc}
                  </p>
                </div>
                <LuArrowRight className="h-4 w-4 shrink-0 text-text-secondary transition-transform group-hover:translate-x-0.5" />
              </Link>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
