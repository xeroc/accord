import { useEffect } from "react";
import { Navigate, Route, Routes, useLocation, useParams } from "react-router-dom";

import { Audience } from "./components/Audience";
import { Capture } from "./components/Capture";
import { FinalCTA } from "./components/FinalCTA";
import { Footer } from "./components/Footer";
import { Heritage } from "./components/Heritage";
import { Hero } from "./components/Hero";
import { Mechanism } from "./components/Mechanism";
import { Nav } from "./components/Nav";
import { BlurbPage } from "./blurb/BlurbPage";
import { ChapterPage } from "./how-it-rules/Chapter";
import { HowItRules } from "./how-it-rules/HowItRules";
import { CHAPTERS, type Chapter } from "./how-it-rules/chapters";

/** Route changes enter at the top — the path router relied on full page
 * loads for this; hash navigation is client-side, so scroll explicitly. */
function ScrollToTop() {
  const { pathname } = useLocation();
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [pathname]);
  return null;
}

function useDocumentTitle() {
  const { pathname } = useLocation();
  useEffect(() => {
    const slug = pathname.match(/^\/how-it-rules\/([a-z-]+)$/)?.[1];
    const chapter = CHAPTERS.find((c) => c.slug === slug);
    document.title =
      pathname === "/how-it-rules"
        ? "How it Rules — Accord"
        : chapter
          ? `${chapter.title} — How it Rules — Accord`
          : pathname === "/blurb"
            ? "About Accord — the blurb page"
            : "Accord — Mechanize the verdict.";
  }, [pathname]);
}

/** One chapter by slug; unknown slugs fall back to the hub. */
function ChapterRoute() {
  const { slug } = useParams();
  const chapter: Chapter | undefined = CHAPTERS.find((c) => c.slug === slug);
  return chapter ? <ChapterPage chapter={chapter} /> : <Navigate to="/how-it-rules" replace />;
}

function Landing() {
  return (
    <>
      <a
        href="#hero"
        onClick={(e) => {
          // in-page jump — with hash routing the hash belongs to the
          // router, so the skip link scrolls instead of navigating
          e.preventDefault();
          document.getElementById("hero")?.scrollIntoView();
        }}
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

export function App() {
  useDocumentTitle();
  return (
    <>
      <ScrollToTop />
      <Routes>
        <Route path="/" element={<Landing />} />
        <Route path="/how-it-rules" element={<HowItRules />} />
        <Route path="/how-it-rules/:slug" element={<ChapterRoute />} />
        <Route path="/blurb" element={<BlurbPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </>
  );
}
