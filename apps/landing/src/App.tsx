import { Footer } from "./components/Footer";
import { Hero } from "./components/Hero";
import { Mechanism } from "./components/Mechanism";
import { Capture } from "./components/Capture";
import { Heritage } from "./components/Heritage";
import { Audience } from "./components/Audience";
import { FinalCTA } from "./components/FinalCTA";
import { Nav } from "./components/Nav";

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
