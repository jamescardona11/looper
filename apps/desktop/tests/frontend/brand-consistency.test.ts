import { readFileSync } from "node:fs";
import { describe, expect, test } from "vitest";

describe("visible brand identity", () => {
  test("identifies the desktop product as Looper", () => {
    const tauriConfig = JSON.parse(
      readFileSync("src-tauri/tauri.conf.json", "utf8"),
    ) as { productName?: string; identifier?: string };
    const packageManifest = JSON.parse(
      readFileSync("package.json", "utf8"),
    ) as { name?: string };

    expect(tauriConfig.productName).toBe("Looper");
    expect(tauriConfig.identifier).toContain("looper");
    expect(packageManifest.name).toBe("looper-desktop");
  });
});
