import { Route, Routes, useLocation } from "react-router-dom";
import { AnimatePresence, motion } from "motion/react";
import { Navbar } from "@/components/navbar";
import { Toaster } from "@/components/ui/sonner";

import { HomePage } from "./features/home/HomePage";
import { CreateListPage } from "./features/list/CreateListPage";
import { ListDetailPage } from "./features/list/ListDetailPage";
import { ItemDetailPage } from "./features/item/ItemDetailPage";
import { SubmitItemPage } from "./features/item/SubmitItemPage";
import { ChallengePage } from "./features/challenge/ChallengePage";

/**
 * App shell — routes + Navbar + Toaster.
 *
 * Routes grow per feature task (milestone accord-4dqb):
 *   /                            → home — left-biased hero + list browser + CTA (accord-5t0a)
 *   /lists/new                   → create-list form (accord-fx93)
 *   /lists/:address              → list detail (accord-hhyy)
 *   /lists/:address/submit       → submit-item form (accord-m2u2)
 *   /items/:address              → item detail — state machine + stakes + withdrawal (accord-gg8f)
 *   /items/:address/challenge    → challenge an item (accord-t877)
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
          <Route path="/lists/new" element={<CreateListPage />} />
          <Route path="/lists/:address" element={<ListDetailPage />} />
          <Route path="/lists/:address/submit" element={<SubmitItemPage />} />
          <Route path="/items/:address" element={<ItemDetailPage />} />
          <Route path="/items/:address/challenge" element={<ChallengePage />} />
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
