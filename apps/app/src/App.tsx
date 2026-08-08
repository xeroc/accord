import { NavLink, HashRouter, Route, Routes } from "react-router-dom";

import { DisputeDetail } from "./features/dispute/DisputeDetail";
import { DisputeList } from "./features/dispute/DisputeList";

function Nav() {
  const linkClass = ({ isActive }: { isActive: boolean }) =>
    `font-mono text-sm ${isActive ? "text-amber" : "text-text-secondary hover:text-text-primary"}`;

  return (
    <nav className="flex items-center gap-6 border-b border-border-subtle px-6 py-3">
      <span className="font-mono text-lg font-semibold text-text-primary">
        Accord
      </span>
      <NavLink to="/disputes" className={linkClass}>
        Disputes
      </NavLink>
    </nav>
  );
}

export default function App() {
  return (
    <HashRouter>
      <div className="min-h-screen bg-ink">
        <Nav />
        <main className="mx-auto max-w-6xl px-6 py-8">
          <Routes>
            <Route path="/" element={<DisputeList />} />
            <Route path="/disputes" element={<DisputeList />} />
            <Route path="/disputes/:address" element={<DisputeDetail />} />
          </Routes>
        </main>
      </div>
    </HashRouter>
  );
}
