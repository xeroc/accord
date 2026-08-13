import { Route, Routes } from "react-router-dom";
import { Navbar } from "@/components/navbar";
import { Toaster } from "@/components/ui/sonner";

import { HomePage } from "./features/home/HomePage";
import { ItemDetailPage } from "./features/item/ItemDetailPage";

/**
 * App shell — routes + Navbar + Toaster.
 *
 * Routes:
 *   /                   → home (registry browser placeholder)
 *   /items/:address     → item detail (state + stakes + withdrawal action)
 *
 * List browse / create-list / submit / challenge routes land with their own
 * feature beans (accord-pzhs / accord-m2u2 / accord-t877). This shell hosts
 * the withdrawal flow (accord-etf5) end-to-end.
 */
export function App() {
  return (
    <>
      <Navbar />
      <main className="mx-auto min-h-screen max-w-6xl px-6 py-8">
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/items/:address" element={<ItemDetailPage />} />
        </Routes>
      </main>
      <Toaster />
    </>
  );
}
