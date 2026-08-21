import { Route, Routes, useLocation } from "react-router-dom";
import { Navbar } from "@/components/navbar";
import { PageShell, PageTransition, Toaster } from "@useaccord/ui";

import { ChapterRoute } from "./features/how-it-works/Chapter";
import { HowItWorks } from "./features/how-it-works/HowItWorks";
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
 *   /how-it-works                → films hub — five Canon films (intro + E1–E4)
 *   /how-it-works/:slug          → one film per chapter: video + takeaways + reading
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
        <Route path="/how-it-works" element={<HowItWorks />} />
        <Route path="/how-it-works/:slug" element={<ChapterRoute />} />
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
