import { QueryClientProvider } from "@tanstack/react-query";
 import { StrictMode } from "react";
 import { createRoot } from "react-dom/client";
 import { HashRouter } from "react-router-dom";

import { queryClient } from "./shared/queryClient";
 import { Providers } from "./providers";
 import { App } from "./App";
 import "./index.css";

// HashRouter — GitHub Pages is static; hash routing needs no server config.
// QueryClient — TanStack Query cache for read hooks (decision #8); the
// singleton lives in shared/queryClient.ts so sendInstruction can invalidate.
 const container = document.getElementById("root");
 if (!container) throw new Error("#root element missing in index.html");

createRoot(container).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <Providers>
        <HashRouter>
          <App />
        </HashRouter>
      </Providers>
    </QueryClientProvider>
  </StrictMode>,
);
