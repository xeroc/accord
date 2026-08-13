import { Route, Routes } from "react-router-dom";
import { Navbar } from "@/components/navbar";
import { Toaster } from "@/components/ui/sonner";

import { ListBrowser } from "./features/list/ListBrowser";

/**
 * App shell — routes + Navbar + Toaster.
 *
 * Routes grow per feature task (milestone accord-4dqb):
 *   /                      → list browser (this task: accord-ajps)
 *   /lists/:address        → list detail (accord-hhyy)
 *   /lists/new             → create-list form (accord-fx93)
 *   /items/:address        → item detail (accord-gg8t)
 *   /lists/:list/items/new → submit-item form (accord-m2u2)
 */
export function App() {
  return (
    <>
      <Navbar />
      <main className="mx-auto min-h-screen max-w-6xl px-6 py-8">
        <Routes>
          <Route path="/" element={<ListBrowser />} />
        </Routes>
      </main>
      <Toaster />
    </>
  );
}
