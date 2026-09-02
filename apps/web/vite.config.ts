import path from "node:path";
import tailwindcss from "@tailwindcss/vite";
import { tanstackRouter } from "@tanstack/router-plugin/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

const productPreviewModuleId = "virtual:product-preview-seeder";
const emptyProductPreviewModuleId = `\0${productPreviewModuleId}.tsx`;

function productPreviewPlugin() {
  const enabled = process.env.VITE_PRODUCT_PREVIEW === "true";
  const previewModule = path.resolve(__dirname, "./product-preview/web-product-preview-seeder.tsx");

  return {
    name: "looper-product-preview",
    resolveId(id: string) {
      if (id !== productPreviewModuleId) return;
      return enabled ? previewModule : emptyProductPreviewModuleId;
    },
    load(id: string) {
      if (id !== emptyProductPreviewModuleId) return;
      return "export function ProductPreviewSeeder() { return null; }";
    },
  };
}

export default defineConfig({
  plugins: [
    productPreviewPlugin(),
    tailwindcss(),
    tanstackRouter({ target: "react", autoCodeSplitting: true }),
    react({
      babel: {
        plugins: [["babel-plugin-react-compiler", { target: "19" }]],
      },
    }),
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
