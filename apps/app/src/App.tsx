import { Route, Routes } from "react-router-dom";
import { Navbar } from "@/components/navbar";
import { Toaster } from "@/components/ui/sonner";

import { DisputeDetail } from "./features/dispute/DisputeDetail";
import { DisputeList } from "./features/dispute/DisputeList";
import { CreateDispute } from "./features/dispute/CreateDispute";
import { SubaccordListPage } from "./features/subaccord/SubaccordListPage";
import { SubaccordCreatePage } from "./features/subaccord/SubaccordCreatePage";
import { SubaccordDetailPage } from "./features/subaccord/SubaccordDetailPage";

/**
 * App shell — routes + Navbar + Toaster.
 *
 * Routes:
 *   /                      → dispute list
 *   /disputes              → dispute list
 *   /disputes/new          → create dispute form
 *   /disputes/:address     → dispute detail + state machine + appeal + ruling
 *   /subaccords            → subaccord list (browse pools)
 *   /subaccords/new        → create subaccord form
 *   /subaccords/:address   → subaccord detail (on-chain params + actions)
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
          <Route path="/subaccords" element={<SubaccordListPage />} />
          <Route path="/subaccords/new" element={<SubaccordCreatePage />} />
          <Route
            path="/subaccords/:address"
            element={<SubaccordDetailPage />}
          />
        </Routes>
      </main>
      <Toaster />
    </>
  );
}
