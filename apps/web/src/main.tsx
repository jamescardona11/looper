import { I18nProvider } from "@looper/i18n/react";
import { createRouter, RouterProvider } from "@tanstack/react-router";
import React from "react";
import ReactDOM from "react-dom/client";
import { initPostHog } from "./lib/analytics";
import { routeTree } from "./routeTree.gen";
import "./app/main.css";

const router = createRouter({
  routeTree,
  defaultPreload: "intent",
  defaultStaleTime: 5000,
  scrollRestoration: true,
});

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}

const rootElement = document.getElementById("root")!;

// HMR guard: avoid creating a second React root over an existing one when Vite
// hot-reloads this module.
function mount(node: React.ReactNode) {
  rootElement.querySelector("[data-boot-loader]")?.remove();
  if (rootElement.dataset.mounted === "true") return;
  rootElement.dataset.mounted = "true";
  ReactDOM.createRoot(rootElement).render(<React.StrictMode>{node}</React.StrictMode>);
}

void boot().catch((error: unknown) => {
  console.error("[looper] boot failed", error);
});

async function boot() {
  const mountedDesktopSurface = false;
  if (!mountedDesktopSurface) {
    initPostHog();
    mount(
      <I18nProvider>
        <RouterProvider router={router} />
      </I18nProvider>,
    );
  }
}
