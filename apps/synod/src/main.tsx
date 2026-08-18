import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { HashRouter } from "react-router-dom";

import { Providers } from "./providers";
import { App } from "./App";
import "./index.css";

// HashRouter — GitHub Pages is static; hash routing needs no server config.
// QueryClient — TanStack Query cache for read hooks.
const container = document.getElementById("root");
if (!container) throw new Error("#root element missing in index.html");

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: 1, refetchOnWindowFocus: false } },
});

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
