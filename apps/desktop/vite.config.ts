import { env } from "node:process";
import { fileURLToPath } from "node:url";
import { lingui } from "@lingui/vite-plugin";
import babel from "@rolldown/plugin-babel";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

const sourceDirectory = fileURLToPath(new URL("./src", import.meta.url));
const tauriHost = env.TAURI_DEV_HOST;

export default defineConfig({
  base: "./",
  plugins: [
    babel({ plugins: ["@lingui/babel-plugin-lingui-macro"] }),
    react(),
    lingui(),
    tailwindcss(),
  ],
  resolve: {
    alias: { "@": sourceDirectory },
  },
  build: {
    chunkSizeWarningLimit: 10_000,
  },
  clearScreen: false,
  server: {
    port: 8_735,
    strictPort: true,
    host: tauriHost || false,
    hmr: tauriHost
      ? {
          protocol: "ws",
          host: tauriHost,
          port: 8_736,
        }
      : undefined,
    watch: {
      ignored: ["**/src-tauri/**"],
    },
  },
});
