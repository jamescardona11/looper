import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createServer, resolveConfig } from "vite";
import { describe, expect, test, vi } from "vitest";

const desktopRoot = fileURLToPath(new URL("../../", import.meta.url));
const viteConfigPath = resolve(desktopRoot, "vite.config.ts");
const tauriConfig = JSON.parse(
  readFileSync(resolve(desktopRoot, "src-tauri", "tauri.conf.json"), "utf8"),
) as {
  build: {
    devUrl: string;
    frontendDist: string;
  };
};

async function resolveRendererConfig() {
  vi.resetModules();
  const { default: config } = await import("../../vite.config");

  return resolveConfig(config, "serve", "development", "development");
}

describe("contrato del renderer Vite", { timeout: 20_000 }, () => {
  test("coincide con la URL y el directorio de distribución de Tauri", async () => {
    const config = await resolveRendererConfig();
    const tauriDevUrl = new URL(tauriConfig.build.devUrl);

    expect(config.server.port).toBe(Number(tauriDevUrl.port));
    expect(config.server.strictPort).toBe(true);
    expect(resolve(config.root, config.build.outDir)).toBe(
      resolve(desktopRoot, "src-tauri", tauriConfig.build.frontendDist),
    );
    expect(config.server.watch.ignored).toEqual(
      expect.arrayContaining(["**/src-tauri/**"]),
    );
  });

  test("adapta HMR al host que entrega Tauri", async () => {
    const previousHost = process.env.TAURI_DEV_HOST;
    const tauriHost = "192.0.2.8";
    process.env.TAURI_DEV_HOST = tauriHost;

    try {
      const config = await resolveRendererConfig();

      expect(config.server.host).toBe(tauriHost);
      expect(config.server.hmr).toMatchObject({
        protocol: "ws",
        host: tauriHost,
        port: 8736,
      });
    } finally {
      if (previousHost === undefined) {
        delete process.env.TAURI_DEV_HOST;
      } else {
        process.env.TAURI_DEV_HOST = previousHost;
      }
      vi.resetModules();
    }
  });

  test("transforma los estilos Tailwind y las macros Lingui del renderer", async () => {
    const server = await createServer({
      configFile: viteConfigPath,
      appType: "custom",
      server: { middlewareMode: true },
    });

    try {
      const styles = await server.transformRequest("/src/app/App.css");
      const messages = await server.transformRequest(
        "/src/features/pill/pill-dictation-overlay.tsx",
      );

      expect(styles?.code).not.toContain('@import "tailwindcss"');
      expect(messages?.code).not.toContain("@lingui/react/macro");
    } finally {
      await server.close();
    }
  });
});
