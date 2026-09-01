import { fileURLToPath } from "node:url";
import { lingui } from "@lingui/vite-plugin";
import babel from "@rolldown/plugin-babel";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

const sourceDirectory = fileURLToPath(new URL("./src", import.meta.url));

export default defineConfig({
  plugins: [
    babel({ plugins: ["@lingui/babel-plugin-lingui-macro"] }),
    react(),
    lingui(),
  ],
  resolve: {
    alias: { "@": sourceDirectory },
  },
  test: {
    include: ["tests/frontend/**/*.test.{ts,tsx}", "src/**/*.test.{ts,tsx}"],
    environment: "node",
    setupFiles: ["./tests/setup-browser-globals.ts"],
  },
});
