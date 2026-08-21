import { beforeEach, describe, expect, test, vi } from "vitest";

const invoke = vi.hoisted(() => vi.fn());

vi.mock("@tauri-apps/api/core", () => ({ invoke }));

import { applyImport, detectImportableApps, previewImport } from "../imports";

describe("import commands", () => {
  beforeEach(() => {
    invoke.mockReset();
  });

  test("requests detected apps and previews by identifier", async () => {
    await detectImportableApps();
    await previewImport("aqua");

    expect(invoke).toHaveBeenNthCalledWith(1, "detect_importable_apps");
    expect(invoke).toHaveBeenNthCalledWith(2, "preview_import", {
      id: "aqua",
    });
  });

  test("forwards all selected import categories", async () => {
    const selections = {
      dictionary: true,
      replacements: true,
      personalities: false,
      shortcut: true,
      language: false,
      autoLaunch: true,
      model: true,
      history: false,
    };

    await applyImport("superwhisper", selections);

    expect(invoke).toHaveBeenCalledWith("apply_import", {
      id: "superwhisper",
      selections,
    });
  });
});
