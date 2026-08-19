import { Route, Routes, useLocation } from "react-router-dom";
import { Navbar } from "@/components/navbar";
import { PageShell, PageTransition, Toaster } from "@useaccord/ui";

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
    <PageTransition transitionKey={location.pathname}>
      <Routes location={location}>
        <Route path="/" element={<HomePage />} />
        <Route path="/lists/new" element={<CreateListPage />} />
        <Route path="/lists/:address" element={<ListDetailPage />} />
        <Route path="/lists/:address/submit" element={<SubmitItemPage />} />
        <Route path="/items/:address" element={<ItemDetailPage />} />
        <Route path="/items/:address/challenge" element={<ChallengePage />} />
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
