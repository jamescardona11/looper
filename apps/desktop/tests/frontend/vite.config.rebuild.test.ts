import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { UserConfig } from "vite";

async function loadConfig(host?: string) {
  vi.resetModules();
  if (host) {
    vi.stubEnv("TAURI_DEV_HOST", host);
  } else {
    vi.unstubAllEnvs();
  }

  const { default: config } = await import("../../vite.config");
  return config as UserConfig;
}

function serverConfig(config: UserConfig) {
  if (!config.server || typeof config.server !== "object") {
    throw new Error("Vite server configuration is required");
  }
  return config.server;
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

describe("Vite desktop configuration", () => {
  it("usa rutas relativas, alias absoluto y un servidor Tauri de puerto fijo", async () => {
    const config = await loadConfig();
    const server = serverConfig(config);
    const alias = config.resolve?.alias as Record<string, string>;

    expect(config.base).toBe("./");
    expect(alias["@"]).toBe(
      fileURLToPath(new URL("../../src", import.meta.url)),
    );
    expect(server.port).toBe(8735);
    expect(server.strictPort).toBe(true);
    expect(server.watch?.ignored).toContain("**/src-tauri/**");
    expect(config.build?.chunkSizeWarningLimit).toBe(1_000);
  });

  it("configura HMR para el host que inyecta Tauri", async () => {
    const server = serverConfig(await loadConfig("10.0.0.8"));

    expect(server.host).toBe("10.0.0.8");
    expect(server.hmr).toEqual({
      protocol: "ws",
      host: "10.0.0.8",
      port: 8736,
    });
  });
});
