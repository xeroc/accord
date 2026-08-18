import { Route, Routes, useLocation } from "react-router-dom";
import { AnimatePresence, motion } from "motion/react";
import { Toaster } from "sonner";

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
          <Route path="/cases/new" element={<NewCasePage />} />
          <Route path="/cases/:address" element={<CaseDetailPage />} />
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
      <Toaster theme="dark" position="bottom-right" />
    </>
  );
}
