import { Route, Routes } from "react-router-dom";
import { Navbar } from "@/components/navbar";
import { Toaster } from "@/components/ui/sonner";

import { HomePage } from "./features/home/HomePage";
import { ItemDetailPage } from "./features/item/ItemDetailPage";
import { SubmitItemPage } from "./features/item/SubmitItemPage";

/**
 * App shell — routes + Navbar + Toaster.
 *
 * Routes:
 *   /                      → home (registry browser placeholder)
 *   /items/:address        → item detail (state + stakes + withdrawal action)
 *   /lists/:address/submit → submit-item form (submit_item)
 *
 * List browse / create-list / challenge routes land with their own feature
 * beans (accord-pzhs / accord-t877). This shell hosts the item feature
 * (accord-vet9): submit, detail, withdrawal.
 */
export function App() {
  return (
    <>
      <Navbar />
      <main className="mx-auto min-h-screen max-w-6xl px-6 py-8">
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/items/:address" element={<ItemDetailPage />} />
          <Route path="/lists/:address/submit" element={<SubmitItemPage />} />
        </Routes>
      </main>
      <Toaster />
    </>
  );
}
