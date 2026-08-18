import { defineConfig } from "vitest/config";

// Convex tests run in edge-runtime to match Convex's runtime semantics.
// See: https://docs.convex.dev/functions/testing
export default defineConfig({
  test: {
    environment: "edge-runtime",
    server: { deps: { inline: ["convex-test"] } },
    setupFiles: [],
  },
});
