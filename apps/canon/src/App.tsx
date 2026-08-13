import { Routes, Route, Link } from "react-router-dom";
import { ChallengePage } from "./features/challenge/ChallengePage";
import { ItemDetailPage } from "./features/evidence/ItemDetailPage";

export function App() {
  return (
    <Routes>
      <Route path="/" element={<Home />} />
      <Route path="/items/:address" element={<ItemDetailPage />} />
      <Route path="/items/:address/challenge" element={<ChallengePage />} />
    </Routes>
  );
}

function Home() {
  return (
    <div className="mx-auto max-w-3xl px-6 py-16">
      <h1 className="font-heading text-2xl font-semibold text-foreground">
        Canon Registry
      </h1>
      <p className="mt-2 text-muted-foreground">
        Curated lists with on-chain arbitration.
      </p>
      <p className="mt-4 text-sm text-muted-foreground">
        Browse lists, submit items, and challenge listings.
      </p>
    </div>
  );
}
