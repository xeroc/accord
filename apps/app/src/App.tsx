import { Routes, Route, Link } from "react-router-dom";
import { SubaccordListPage } from "./features/subaccord/SubaccordListPage";

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
    <Routes>
      <Route path="/" element={<Home />} />
      <Route path="/subaccords" element={<SubaccordListPage />} />
      <Route path="*" element={<NotFound />} />
    </Routes>
  );
}

function Home() {
  return (
    <main style={{ fontFamily: "ui-monospace, monospace", padding: "2rem" }}>
      <h1>Accord</h1>
      <p>Mechanize the verdict.</p>
      <nav>
        <Link to="/">Home</Link>
        {" · "}
        <Link to="/subaccords">Subaccords</Link>
      </nav>
    </main>
  );
}

function NotFound() {
  return (
    <main style={{ fontFamily: "ui-monospace, monospace", padding: "2rem" }}>
      <h1>404</h1>
      <p>This route does not exist yet.</p>
      <Link to="/">Back to home</Link>
    </main>
  );
}
