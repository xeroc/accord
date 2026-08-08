import { Route, Routes } from "react-router-dom";
import { Navbar } from "@/components/navbar";
import { Toaster } from "@/components/ui/sonner";

import { DisputeDetail } from "./features/dispute/DisputeDetail";
import { DisputeList } from "./features/dispute/DisputeList";
import { CreateDispute } from "./features/dispute/CreateDispute";

/**
 * App shell — routes + Navbar + Toaster.
 *
 * Routes (milestone dispute features):
 *   /                      → dispute list
 *   /disputes              → dispute list
 *   /disputes/new          → create dispute form
 *   /disputes/:address     → dispute detail + state machine + appeal + ruling
 *
 * Navbar (wallet connect + cluster selector) and Toaster land from the
 * scaffold-infrastructure epic; dispute routes from the milestone features.
 */
export function App() {
  return (
    <>
      <Navbar />
      <main className="mx-auto min-h-screen max-w-6xl px-6 py-8">
        <Routes>
          <Route path="/" element={<DisputeList />} />
          <Route path="/disputes" element={<DisputeList />} />
          <Route path="/disputes/new" element={<CreateDispute />} />
          <Route path="/disputes/:address" element={<DisputeDetail />} />
        </Routes>
      </main>
      <Toaster />
    </>
  );
}
