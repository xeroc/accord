import { useEffect, useState } from "react";

import { Audience } from "./components/Audience";
import { Capture } from "./components/Capture";
import { FinalCTA } from "./components/FinalCTA";
import { Footer } from "./components/Footer";
import { Heritage } from "./components/Heritage";
import { Hero } from "./components/Hero";
import { Mechanism } from "./components/Mechanism";
import { Nav } from "./components/Nav";
import { ChapterPage } from "./how-it-rules/Chapter";
import { HowItRules } from "./how-it-rules/HowItRules";
import { CHAPTERS, type Chapter } from "./how-it-rules/chapters";

// GitHub Pages has no SPA fallback: a hard navigation to /how-it-rules/…
// serves public/404.html, whose script banks the attempted path here and
// bounces to /. Restore it before the first render, then clean up.
const GH_PAGES_RECOVERY_KEY = "how-it-rules-path";

type Route = "landing" | "hub" | { chapter: Chapter };

function routeFor(pathname: string): Route {
  const path = pathname.replace(/\/+$/, "") || "/";
  if (path === "/how-it-rules") return "hub";
  const slug = path.match(/^\/how-it-rules\/([a-z-]+)$/)?.[1];
  const chapter = CHAPTERS.find((c) => c.slug === slug);
  return chapter ? { chapter } : "landing";
}

function recoverDeepLink() {
  try {
    const stored = window.sessionStorage.getItem(GH_PAGES_RECOVERY_KEY);
    if (stored && stored.startsWith("/how-it-rules")) {
      window.sessionStorage.removeItem(GH_PAGES_RECOVERY_KEY);
      window.history.replaceState(null, "", stored);
    }
  } catch {
    // sessionStorage unavailable (privacy mode) — serve the landing.
  }
}

// Apply the GitHub Pages deep-link recovery once, at module load, so the
// initial useState sees the restored URL.
recoverDeepLink();

export function App() {
  const [route, setRoute] = useState<Route>(() => routeFor(window.location.pathname));

  useEffect(() => {
    const onPop = () => setRoute(routeFor(window.location.pathname));
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  useEffect(() => {
    document.title =
      route === "hub"
        ? "How it Rules — Accord"
        : typeof route === "object"
          ? `${route.chapter.title} — How it Rules — Accord`
          : "Accord — Mechanize the verdict.";
  }, [route]);

  if (route === "hub") return <HowItRules />;
  if (typeof route === "object") return <ChapterPage chapter={route.chapter} />;

  return (
    <>
      <a
        href="#hero"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded focus:bg-raised focus:px-4 focus:py-2 focus:font-mono focus:text-sm focus:text-nearwhite"
      >
        Skip to content
      </a>
      <Nav />
      <main>
        <Hero />
        <Mechanism />
        <Capture />
        <Heritage />
        <Audience />
        <FinalCTA />
      </main>
      <Footer />
    </>
  );
}
