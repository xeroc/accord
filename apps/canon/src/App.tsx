import { Route, Routes } from "react-router-dom";
import { Navbar } from "@/components/navbar";
import { Toaster } from "@/components/ui/sonner";

import { ListBrowser } from "./features/list/ListBrowser";
import { CreateListPage } from "./features/list/CreateListPage";
import { ListDetailPage } from "./features/list/ListDetailPage";
import { ItemDetailPage } from "./features/item/ItemDetailPage";
import { SubmitItemPage } from "./features/item/SubmitItemPage";
import { ChallengePage } from "./features/challenge/ChallengePage";

/**
 * App shell — routes + Navbar + Toaster.
 *
 * Routes grow per feature task (milestone accord-4dqb):
 *   /                            → list browser (accord-ajjs)
 *   /lists/new                   → create-list form (accord-fx93)
 *   /lists/:address              → list detail (accord-hhyy)
 *   /lists/:address/submit       → submit-item form (accord-m2u2)
 *   /items/:address              → item detail — state machine + stakes + withdrawal (accord-gg8f)
 *   /items/:address/challenge    → challenge an item (accord-t877)
 *
 * The canonical item-detail view is `features/item/ItemDetailPage` (the full
 * five-state lifecycle). `features/evidence/ItemDetailPage` was an earlier
 * evidence-only stopgap (its own comment defers the lifecycle view to "E3");
 * it stays in-tree for the evidence-manifest work, unreferenced by the router.
 */
export function App() {
  return (
    <>
      <Navbar />
      <main className="mx-auto min-h-screen max-w-6xl px-6 py-8">
        <Routes>
          <Route path="/" element={<ListBrowser />} />
          <Route path="/lists/new" element={<CreateListPage />} />
          <Route path="/lists/:address" element={<ListDetailPage />} />
          <Route path="/lists/:address/submit" element={<SubmitItemPage />} />
          <Route path="/items/:address" element={<ItemDetailPage />} />
          <Route path="/items/:address/challenge" element={<ChallengePage />} />
        </Routes>
      </main>
      <Toaster />
    </>
  );
}
