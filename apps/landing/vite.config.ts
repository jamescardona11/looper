import { createRequire } from "node:module";
import path from "node:path";
import { chromium } from "@playwright/test";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// vite-plugin-prerender ships CommonJS only, so it cannot be `import`ed from an
// ESM config. Same escape hatch as apps/web/vite.config.ts.
const require = createRequire(import.meta.url);
const vitePrerender =
  require("vite-plugin-prerender") as typeof import("vite-plugin-prerender").default;

// Single marketing page. Prerendering bakes the rendered markup into dist/index.html
// so crawlers and social scrapers see real content instead of an empty #root.
const PUBLIC_ROUTES = ["/"];

export default defineConfig({
  plugins: [
    tailwindcss(),
    react({
      babel: {
        plugins: [["babel-plugin-react-compiler", { target: "19" }]],
      },
    }),
    // `PRERENDER=false` skips the Chromium round-trip for fast local builds and
    // for hosts where the Playwright browser is not installed.
    ...(process.env.PRERENDER !== "false"
      ? [
          vitePrerender({
            staticDir: path.resolve(__dirname, "dist"),
            routes: PUBLIC_ROUTES,
            renderer: new vitePrerender.PuppeteerRenderer({
              executablePath: process.env.CHROME_PATH ?? chromium.executablePath(),
              headless: true,
              maxConcurrentRoutes: 2,
              // The page MUST mount a <main> containing an <h1> or the renderer
              // never resolves and the build hangs.
              renderAfterElementExists: "main h1",
              skipThirdPartyRequests: true,
            }),
            postProcess(renderedRoute) {
              renderedRoute.route = renderedRoute.originalRoute;
              renderedRoute.html = renderedRoute.html.replace(/\sdata-mounted="true"/, "");
              return renderedRoute;
            },
          }),
        ]
      : []),
  ],
  build: {
    target: "es2022",
    sourcemap: true,
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
    // pnpm's per-worktree hoisting can otherwise resolve two React copies, which
    // surfaces as "Cannot read properties of null" from the hook dispatcher.
    dedupe: ["react", "react-dom", "react/jsx-runtime", "react/jsx-dev-runtime"],
  },
  server: { port: 5174 },
});
