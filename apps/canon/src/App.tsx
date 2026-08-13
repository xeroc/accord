import { Route, Routes } from "react-router-dom";
import { Navbar } from "@/components/navbar";
import { Toaster } from "@/components/ui/sonner";

/**
 * App shell — routes + Navbar + Toaster.
 *
 * Feature routes land with canon feature beans. For now, a placeholder
 * home renders the Navbar so the ConnectorKit wiring is verifiable.
 *
 * Target routes (milestone §2):
 *   /                      → list browser (getProgramAccounts on CanonList)
 *   /lists/:address        → list detail (items via memcmp on `list` field)
 *   /lists/new             → create-list form
 *   /items/:address        → item detail (state machine + dispute cross-link)
 */
export function App() {
  return (
    <>
      <Navbar />
      <main className="mx-auto min-h-screen max-w-6xl px-6 py-8">
        <Routes>
          <Route
            path="/"
            element={
              <div className="mono text-muted-foreground">
                Canon Registry — lists browser landing soon.
              </div>
            }
          />
        </Routes>
      </main>
      <Toaster />
    </>
  );
}
