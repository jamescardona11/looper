import { describe, expect, test } from "vitest";
import { classifyCli, storageMetrics } from "../about-tab-model";
import type { AppInfo, CliInstallStatus } from "../../../../contracts/index";

const cliStatus = (
  overrides: Partial<CliInstallStatus> = {},
): CliInstallStatus => ({
  installed: false,
  managedByApp: false,
  sourceAvailable: true,
  installPath: "/usr/local/bin/looper",
  sourcePath: null,
  command: "looper",
  pathInShell: true,
  ...overrides,
});

describe("about tab model", () => {
  test("classifies every command-line ownership boundary", () => {
    expect(classifyCli(cliStatus({ sourceAvailable: false }), true)).toBe(
      "unavailable",
    );
    expect(classifyCli(cliStatus(), false)).toBe("locked");
    expect(
      classifyCli(cliStatus({ installed: true, managedByApp: false }), true),
    ).toBe("external");
    expect(
      classifyCli(cliStatus({ installed: true, managedByApp: true }), true),
    ).toBe("managed");
    expect(classifyCli(cliStatus({ pathInShell: false }), true)).toBe(
      "path-missing",
    );
    expect(classifyCli(cliStatus(), true)).toBe("available");
  });

  test("uses the detailed storage total and falls back to the legacy size", () => {
    const appInfo: AppInfo = {
      version: "1.0.0",
      data_dir_path: "/data",
      data_dir_size_bytes: 99,
      storage_breakdown: {
        recordings_bytes: 1,
        library_bytes: 2,
        models_bytes: 3,
        databases_bytes: 4,
        total_bytes: 10,
      },
    };
    expect(storageMetrics(appInfo).map(({ bytes }) => bytes)).toEqual([
      1, 2, 3, 4, 10,
    ]);
    expect(
      storageMetrics({
        ...appInfo,
        storage_breakdown: { ...appInfo.storage_breakdown, total_bytes: 0 },
      }).at(-1)?.bytes,
    ).toBe(0);
    expect(storageMetrics(null).every(({ bytes }) => bytes === 0)).toBe(true);
  });
});
