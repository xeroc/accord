import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { HashRouter } from "react-router-dom";
import { Providers } from "./providers";
import { App } from "./App";
import "./index.css";

// HashRouter — GitHub Pages is static; hash routing needs no server config.
const container = document.getElementById("root");
if (!container) throw new Error("#root element missing in index.html");

createRoot(container).render(
  <StrictMode>
    <Providers>
      <HashRouter>
        <App />
      </HashRouter>
    </Providers>
  </StrictMode>,
);
