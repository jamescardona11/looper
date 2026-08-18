import { createRequire } from "node:module";
import { createReadStream, existsSync, statSync } from "node:fs";
import type { IncomingMessage, ServerResponse } from "node:http";
import path from "node:path";
import { chromium } from "@playwright/test";
import tailwindcss from "@tailwindcss/vite";
import { tanstackRouter } from "@tanstack/router-plugin/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

const require = createRequire(import.meta.url);
const vitePrerender =
  require("vite-plugin-prerender") as typeof import("vite-plugin-prerender").default;
const repoRoot = path.resolve(__dirname, "../..");
const namedAudioFixtures = new Map([
  ["harvard.wav", path.resolve(repoRoot, "test-support/fixtures/audio/harvard.wav")],
]);

const configuredAudioFixture = process.env.LOOPER_AUDIO_FIXTURE ?? process.env.E2E_AUDIO_FIXTURE;
if (configuredAudioFixture && !process.env.VITE_E2E_AUDIO_FIXTURE) {
  process.env.VITE_E2E_AUDIO_FIXTURE = "env";
}

const PUBLIC_ROUTES = [
  "/",
  "/landing",
  "/pricing",
  "/roadmap",
  "/changelog",
  "/contact",
  "/waitlist",
  "/privacy",
  "/terms",
];

type ConnectNext = (error?: unknown) => void;
type DevServerWithMiddleware = {
  middlewares: {
    use(
      route: string,
      handler: (request: IncomingMessage, response: ServerResponse, next: ConnectNext) => void,
    ): void;
  };
};

export default defineConfig({
  plugins: [
    e2eAudioFixturePlugin(),
    tailwindcss(),
    tanstackRouter({ target: "react", autoCodeSplitting: true }),
    react({
      babel: {
        plugins: [["babel-plugin-react-compiler", { target: "19" }]],
      },
    }),
    ...(process.env.PRERENDER !== "false"
      ? [
          vitePrerender({
            staticDir: path.resolve(__dirname, "dist"),
            routes: PUBLIC_ROUTES,
            renderer: new vitePrerender.PuppeteerRenderer({
              executablePath: process.env.CHROME_PATH ?? chromium.executablePath(),
              headless: true,
              maxConcurrentRoutes: 2,
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
    // Budget: warn if any single chunk exceeds this (the heavy diagram libs are
    // already lazy-loaded as their own chunks).
    chunkSizeWarningLimit: 800,
    rollupOptions: {
      output: {
        // Split stable vendor libs into long-cached chunks so app-code changes
        // don't bust them, and the main entry chunk stays smaller.
        //
        // Vite 8 bundles with rolldown, which requires `manualChunks` to be a
        // FUNCTION — the rollup-era object form throws "manualChunks is not a
        // function" and breaks `vite build`. Resolve each module's package to
        // keep the grouping stable across supported hosts.
        manualChunks(id) {
          if (!id.includes("node_modules")) return;
          const after = id.split(/[\\/]node_modules[\\/]/).pop() ?? "";
          const pkg = after.startsWith("@")
            ? after.split(/[\\/]/).slice(0, 2).join("/")
            : after.split(/[\\/]/)[0];
          if (pkg === "react" || pkg === "react-dom") return "vendor-react";
          if (pkg === "convex") return "vendor-convex";
          if (pkg === "@tabler/icons-react") return "vendor-icons";
        },
      },
    },
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
    // Single instance of React AND of convex/react: the Convex client lives in a
    // React context, so a duplicated convex module would surface as "useQuery must
    // be used under ConvexProvider". Cheap insurance against the prod chunk split.
    dedupe: [
      "react",
      "react-dom",
      "react/jsx-runtime",
      "react/jsx-dev-runtime",
      "convex",
      "convex/react",
    ],
  },
  optimizeDeps: {
    include: [
      "react",
      "react-dom",
      "react/jsx-runtime",
      "@formkit/auto-animate/react",
      "react-markdown",
      "remark-gfm",
    ],
  },
  server: { port: 5173 },
});

function e2eAudioFixturePlugin() {
  return {
    name: "e2e-audio-fixtures",
    configureServer(server: DevServerWithMiddleware) {
      const serveFixture = (
        request: IncomingMessage,
        response: ServerResponse,
        next: ConnectNext,
      ) => {
        const filename = request.url?.replace(/^\//, "").split("?")[0] ?? "";
        const fixturePath =
          filename === "env.wav" && configuredAudioFixture
            ? path.resolve(configuredAudioFixture)
            : namedAudioFixtures.get(filename);

        if (!fixturePath || !existsSync(fixturePath)) {
          next();
          return;
        }

        const stat = statSync(fixturePath);
        response.statusCode = 200;
        response.setHeader("content-type", "audio/wav");
        response.setHeader("content-length", String(stat.size));
        createReadStream(fixturePath).pipe(response);
      };
      server.middlewares.use("/__e2e-audio-fixtures", serveFixture);
    },
  };
}
