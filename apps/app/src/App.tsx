import { Route, Routes, useLocation } from "react-router-dom";
import { Navbar } from "@/components/navbar";
import { PageShell, PageTransition, Toaster } from "@useaccord/ui";

import { HomePage } from "./features/home/HomePage";
import { DisputeDetail } from "./features/dispute/DisputeDetail";
import { DisputeList } from "./features/dispute/DisputeList";
import { CreateDispute } from "./features/dispute/CreateDispute";
import { SubaccordListPage } from "./features/subaccord/SubaccordListPage";
import { SubaccordCreatePage } from "./features/subaccord/SubaccordCreatePage";
import { SubaccordDetailPage } from "./features/subaccord/SubaccordDetailPage";
import { JurorDashboardPage } from "./features/juror/JurorDashboardPage";
import { JurorBrowsePage } from "./features/juror/JurorBrowsePage";
import { JurorDetailPage } from "./features/juror/JurorDetailPage";
import { StakePage } from "./features/juror/StakePage";

/**
 * App shell — routes + Navbar + Toaster.
 *
 * Routes:
 *   /                      → home (option cards landing)
 *   /juror                 → juror dashboard (my stakes across subaccords)
 *   /juror/browse          → browse all active jurors across all subaccords (table)
 *   /juror/:address        → juror detail (stakes + SAS attestations)
 *   /juror/stake           → stake form + per-stake management actions
 *   /disputes/new          → create dispute form
 *   /disputes/:address     → dispute detail + state machine + appeal + ruling
 *   /subaccords            → subaccord list (browse pools)
 *   /subaccords/new        → create subaccord form
 *   /subaccords/:address   → subaccord detail (on-chain params + actions)
 */
function AnimatedRoutes() {
  const location = useLocation();
  return (
    <PageTransition transitionKey={location.pathname}>
      <Routes location={location}>
        <Route path="/" element={<HomePage />} />
        <Route path="/juror" element={<JurorDashboardPage />} />
        <Route path="/juror/browse" element={<JurorBrowsePage />} />
        <Route path="/juror/stake" element={<StakePage />} />
        <Route path="/juror/:address" element={<JurorDetailPage />} />
        <Route path="/disputes" element={<DisputeList />} />
        <Route path="/disputes/new" element={<CreateDispute />} />
        <Route path="/disputes/:address" element={<DisputeDetail />} />
        <Route path="/subaccords" element={<SubaccordListPage />} />
        <Route path="/subaccords/new" element={<SubaccordCreatePage />} />
        <Route
          path="/subaccords/:address"
          element={<SubaccordDetailPage />}
        />
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
