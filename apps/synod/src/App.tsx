import { Route, Routes, useLocation } from "react-router-dom";
import { PageShell, PageTransition, Toaster } from "@useaccord/ui";

import { Navbar } from "./components/navbar";

import { HomePage } from "./features/home/HomePage";
import { NewCasePage } from "./features/case/NewCasePage";
import { CaseDetailPage } from "./features/case/CaseDetailPage";

/**
 * App shell — routes + Toaster.
 *
 * Routes grow per feature task (milestone accord-daq8):
 *   /                       → home — hero + "Cases awaiting you" inbox + case browser (accord-hvf9)
 *   /cases/new              → new-case form — subaccord picker + open_case (accord-3rk5)
 *   /cases/:address         → case detail — roster + state machine + join w/ evidence (accord-o6nn)
 *   /cases/:address/...     → dispute card + manual file/claim/refund (accord-9aoc)
 */
function AnimatedRoutes() {
  const location = useLocation();
  return (
    <PageTransition transitionKey={location.pathname}>
      <Routes location={location}>
        <Route path="/" element={<HomePage />} />
        <Route path="/cases/new" element={<NewCasePage />} />
        <Route path="/cases/:address" element={<CaseDetailPage />} />
      </Routes>
    </PageTransition>
  );
}

export function App() {
  return (
    <>
      <PageShell header={<Navbar />}>
        <AnimatedRoutes />
      </PageShell>
      <Toaster />
    </>
  );
}
