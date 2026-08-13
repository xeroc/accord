import { Route, Routes } from "react-router-dom";
import { Navbar } from "@/components/navbar";
import { Toaster } from "@/components/ui/sonner";

import { HomePage } from "./features/home/HomePage";
import { CreateListPage } from "./features/list/CreateListPage";
import { ListDetailPage } from "./features/list/ListDetailPage";
import { ItemDetailPage } from "./features/evidence/ItemDetailPage";
import { ChallengePage } from "./features/challenge/ChallengePage";

/**
 * App shell — routes + Navbar + Toaster.
 *
 * Routes grow per feature task (milestone accord-4dqb):
 *   /                      → home (left-biased hero + list browser + CTA)
 *   /lists/:address        → list detail (accord-hhyy)
 *   /lists/new             → create-list form (accord-fx93)
 *   /items/:address        → item detail + evidence manifest (accord-t877)
 *   /items/:address/challenge → challenge an item (accord-t877)
 */
export function App() {
  return (
    <>
      <Navbar />
      <main className="mx-auto min-h-screen max-w-6xl px-6 py-8">
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/lists/new" element={<CreateListPage />} />
          <Route path="/lists/:address" element={<ListDetailPage />} />
          <Route path="/items/:address" element={<ItemDetailPage />} />
          <Route path="/items/:address/challenge" element={<ChallengePage />} />
        </Routes>
      </main>
      <Toaster />
    </>
  );
}
