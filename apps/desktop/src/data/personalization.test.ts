import { beforeEach, describe, expect, test, vi } from "vitest";

const invoke = vi.hoisted(() => vi.fn());
vi.mock("@tauri-apps/api/core", () => ({ invoke }));

import {
  getModeRules,
  getPersonalities,
  listInstalledApps,
  listWebsiteIcons,
  previewPersonalityStyle,
  setModeRules,
  setPersonalities,
} from "./personalization";

describe("personalization native gateway", () => {
  beforeEach(() => invoke.mockReset());

  test("routes catalogs and preview commands", async () => {
    invoke.mockResolvedValue([]);

    await getPersonalities();
    await listInstalledApps();
    await listWebsiteIcons(["example.com"]);
    await previewPersonalityStyle("concise", "Original text");
    await getModeRules();

    expect(invoke.mock.calls).toEqual([
      ["get_personalities", undefined],
      ["list_installed_apps", undefined],
      ["list_website_icons", { sites: ["example.com"] }],
      [
        "preview_personality_style",
        { personalityId: "concise", text: "Original text" },
      ],
      ["get_mode_rules", undefined],
    ]);
  });

  test("persists personality and workflow arrays under native argument names", async () => {
    invoke.mockResolvedValue([]);
    const personalities = [
      {
        id: "concise",
        name: "Concise",
        enabled: true,
        apps: [],
        websites: [],
        instructions: ["Be brief"],
      },
    ];
    const modeRules = [
      {
        id: "email",
        name: "Email",
        enabled: true,
        trigger: { type: "field" as const, field: "email" as const },
        input: "dictation" as const,
        engine: "auto" as const,
        language: null,
        transform_preset: "email" as const,
        custom_prompt: null,
        deterministic_only: false,
        output: { type: "insert" as const },
        auto_send_on_insert: false,
      },
    ];

    await setPersonalities(personalities);
    await setModeRules(modeRules);

    expect(invoke).toHaveBeenNthCalledWith(1, "set_personalities", {
      personalities,
    });
    expect(invoke).toHaveBeenNthCalledWith(2, "set_mode_rules", { modeRules });
  });
});
