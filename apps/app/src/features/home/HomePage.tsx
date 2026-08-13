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
          className="overflow-hidden rounded-lg bg-card ring-1 ring-foreground/10"
        >
          <div className="border-b border-border px-5 py-3">
            <h2 className="font-mono text-sm font-semibold text-foreground">
              {group.title}
            </h2>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {group.tagline}
            </p>
          </div>
          <div className="divide-y divide-border">
            {group.items.map((item) => (
              <Link
                key={item.to}
                to={item.to}
                className="group flex items-center gap-3 px-5 py-4 transition-[background-color] hover:bg-muted/50"
              >
                <item.icon className="h-4 w-4 shrink-0 text-muted-foreground transition-colors group-hover:text-amber" />
                <div className="flex-1">
                  <span className="text-sm font-medium">
                    {item.label}
                  </span>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {item.desc}
                  </p>
                </div>
                <LuArrowRight className="h-4 w-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
              </Link>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
