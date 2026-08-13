/**
 * HomePage — `/`.
 *
 * Placeholder registry browser. The full list browser (getProgramAccounts over
 * CanonList) + featured slot land with accord-pzhs / accord-5t0a. This stub
 * keeps routing resolvable and points users at the item-detail deep link
 * (`/items/:address`) that hosts the withdrawal flow (accord-etf5).
 */

import { Link } from "react-router-dom";

export function HomePage() {
  return (
    <div className="page">
      <div className="page-head">
        <h1 className="title mono">Canon</h1>
        <p className="lede mono">
          A permissionless curated-list registry on Accord.
        </p>
      </div>
      <div className="empty">
        <p className="empty-head">Registry browser coming soon</p>
        <p className="empty-body">
          Browse lists, submit items, and challenge fraud from this view. For now,
          open an item directly:
        </p>
        <Link to="/items/11111111111111111111111111111111" className="cta">
          View an item
        </Link>
      </div>
    </div>
  );
}
