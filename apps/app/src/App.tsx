import { Route, Routes, useLocation } from "react-router-dom";
import { AnimatePresence, motion } from "motion/react";
import { Navbar } from "@/components/navbar";
import { Toaster } from "@/components/ui/sonner";

import { HomePage } from "./features/home/HomePage";
import { DisputeDetail } from "./features/dispute/DisputeDetail";
import { DisputeList } from "./features/dispute/DisputeList";
import { CreateDispute } from "./features/dispute/CreateDispute";
import { SubaccordListPage } from "./features/subaccord/SubaccordListPage";
import { SubaccordCreatePage } from "./features/subaccord/SubaccordCreatePage";
import { SubaccordDetailPage } from "./features/subaccord/SubaccordDetailPage";
import { JurorDashboardPage } from "./features/juror/JurorDashboardPage";
import { StakePage } from "./features/juror/StakePage";
import { JurorBrowsePage } from "./features/juror/JurorBrowsePage";

/**
 * App shell — routes + Navbar + Toaster.
 *
 * Routes:
 *   /                      → home (option cards landing)
 *   /juror                 → juror dashboard (my stakes across subaccords)
 *   /juror/browse          → browse all active jurors across all subaccords
 *   /juror/stake           → stake form + per-stake management actions
 *   /disputes              → dispute list
 *   /disputes/new          → create dispute form
 *   /disputes/:address     → dispute detail + state machine + appeal + ruling
 *   /subaccords            → subaccord list (browse pools)
 *   /subaccords/new        → create subaccord form
 *   /subaccords/:address   → subaccord detail (on-chain params + actions)
 */
function AnimatedRoutes() {
  const location = useLocation();
  return (
    <AnimatePresence mode="wait">
      <motion.div
        key={location.pathname}
        initial={{ opacity: 0, y: 12, filter: "blur(4px)" }}
        animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
        exit={{
          opacity: 0,
          y: -12,
          filter: "blur(4px)",
          transition: { type: "spring", bounce: 0, duration: 0.3 },
        }}
        transition={{ type: "spring", bounce: 0, duration: 0.4 }}
      >
        <Routes location={location}>
          <Route path="/" element={<HomePage />} />
          <Route path="/juror" element={<JurorDashboardPage />} />
          <Route path="/juror/stake" element={<StakePage />} />
          <Route path="/juror/browse" element={<JurorBrowsePage />} />
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
      </motion.div>
    </AnimatePresence>
  );
}

export function App() {
  return (
    <>
      <Navbar />
      <main className="mx-auto min-h-screen max-w-6xl px-6 py-8">
        <AnimatedRoutes />
      </main>
      <Toaster />
    </>
  );
}
