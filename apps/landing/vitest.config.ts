import path from "node:path";
import react from "@vitejs/plugin-react";
import { defineConfig, type UserConfig } from "vitest/config";

const plugins = [react()] as UserConfig["plugins"];

// Deliberately separate from vite.config.ts: sharing one file would make every
// `vitest` run load the prerenderer and @playwright/test.
export default defineConfig({
  plugins,
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
    dedupe: ["react", "react-dom"],
  },
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./src/test-setup.ts"],
    include: ["src/**/*.{test,spec}.{ts,tsx}"],
    exclude: ["node_modules", "dist"],
  },
});
