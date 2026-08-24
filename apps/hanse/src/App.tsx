import { Capital } from "./components/Capital";
import { Category } from "./components/Category";
import { Faq } from "./components/Faq";
import { FinalCTA } from "./components/FinalCTA";
import { Footer } from "./components/Footer";
import { Hero } from "./components/Hero";
import { HowItRuns } from "./components/HowItRuns";
import { Ladder } from "./components/Ladder";
import { Machines } from "./components/Machines";
import { Nav } from "./components/Nav";

// Single page, no routing: hero → category → machines → how it runs →
// ladder → capital → FAQ → CTA. Copy authority: meta/mutuals/03-website-copy/
// landing-page.md; status claims per the messaging guide §6 ledger.
export function App() {
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
        <Category />
        <Machines />
        <HowItRuns />
        <Ladder />
        <Capital />
        <Faq />
        <FinalCTA />
      </main>
      <Footer />
    </>
  );
}
