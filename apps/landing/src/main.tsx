import React from "react";
import ReactDOM from "react-dom/client";
import { App } from "./app";
import "./styles/index.css";

const rootElement = document.getElementById("root")!;

// HMR guard: avoid creating a second React root over an existing one when Vite
// hot-reloads this module. The prerenderer strips `data-mounted` from the
// static HTML (see postProcess in vite.config.ts) so hydration starts clean.
if (rootElement.dataset.mounted !== "true") {
  rootElement.dataset.mounted = "true";
  ReactDOM.createRoot(rootElement).render(
    <React.StrictMode>
      <App />
    </React.StrictMode>,
  );
}
