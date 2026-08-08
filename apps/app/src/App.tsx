import { Routes, Route, Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Toaster } from "@/components/ui/sonner";
import { Navbar } from "@/components/navbar";

/**
 * App shell — routes + layout skeleton.
 *
 * Routes mirror the milestone handoff (§5 Architecture):
 *   /                      → home
 *   /subaccords            → list (accord-38y6)
 *   /subaccords/new        → create form (happy path a)
 *   /subaccords/:address   → detail
 *   /juror                 → juror home
 *   /juror/stake           → stake form (happy path b)
 *   /disputes              → list
 *   /disputes/new          → create dispute (happy path c)
 *   /disputes/:address     → detail + inline voting + appeal + ruling
 *
 * Feature pages land with their sibling beans; this scaffold wires the
 * router so navigation works the moment they arrive.
 */
export function App() {
  return (
    <>
      <Navbar />
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="*" element={<NotFound />} />
      </Routes>
      <Toaster />
    </>
  );
}

function Home() {
  return (
    <main className="min-h-screen bg-background p-8 font-mono">
      <h1 className="text-2xl font-bold text-foreground">Accord</h1>
      <p className="mt-2 text-muted-foreground">Mechanize the verdict.</p>
      <p className="mt-1 text-sm text-muted-foreground">
        dApp scaffold ready. Routes and wallet connection land next.
      </p>
      <nav className="mt-4">
        <Button asChild>
          <Link to="/">Home</Link>
        </Button>
      </nav>
    </main>
  );
}

function NotFound() {
  return (
    <main className="min-h-screen bg-background p-8 font-mono">
      <h1 className="text-2xl font-bold text-foreground">404</h1>
      <p className="mt-2 text-muted-foreground">
        This route does not exist yet.
      </p>
      <Button asChild variant="outline">
        <Link to="/">Back to home</Link>
      </Button>
    </main>
  );
}
