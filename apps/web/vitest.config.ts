import path from "node:path";
import react from "@vitejs/plugin-react";
import { defineConfig, type UserConfig } from "vitest/config";

const plugins = [react()] as UserConfig["plugins"];

// Excluding `e2e/` is required: Playwright specs import `@playwright/test`
// and must not be picked up by Vitest. Playwright runs via `make e2e`.
export default defineConfig({
  plugins,
  // Mirror the `@` → src alias from vite.config.ts so component tests can import
  // modules the app references via `@/...` (e.g. `@/lib/cn`).
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
    // Force a single React instance so components pulled from workspace packages
    // (e.g. @looper/i18n's I18nProvider) share the test's React. A duplicate
    // copy makes hooks throw "Cannot read properties of null (reading 'useState')",
    // and pnpm's per-worktree hoisting can otherwise resolve two.
    dedupe: ["react", "react-dom"],
  },
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./src/test-setup.ts"],
    include: ["src/**/__tests__/*.{test,spec}.{ts,tsx}", "tests/**/*.{test,spec}.{ts,tsx}"],
    exclude: ["node_modules", "dist", "e2e/**", "**/*.generated.*"],
    // Inline the node_modules packages that render React (@lingui/react via the
    // I18nProvider, @base-ui/react via the shared UI primitives) so vite transforms
    // them in the same module graph and they share the test's single React
    // instance. Externalized, each loads its own React whose hook dispatcher is
    // null ("Cannot read properties of null (reading 'useRef'/'useContext')").
    server: {
      deps: {
        inline: [/@base-ui\//, /@lingui\//],
      },
    },
  },
});
