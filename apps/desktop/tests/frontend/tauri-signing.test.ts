import { describe, expect, test } from "vitest";
import {
  configureMacQaSigning,
  parseAppleDevelopmentIdentities,
} from "../../scripts/tauri-signing.mjs";

describe("Tauri QA signing", () => {
  test("parses stable Apple Development identities", () => {
    const output = `
      1) ABC "Apple Development: Developer One (TEAMONE)"
      2) DEF "Apple Development: Developer Two (TEAMTWO)"
    `;

    expect(parseAppleDevelopmentIdentities(output)).toEqual([
      "Apple Development: Developer One (TEAMONE)",
      "Apple Development: Developer Two (TEAMTWO)",
    ]);
  });

  test("preserves an explicitly selected signing identity", () => {
    const env = { APPLE_SIGNING_IDENTITY: "Explicit Identity" };

    configureMacQaSigning({
      args: ["build", "--config", "src-tauri/tauri.qa.conf.json"],
      env,
      platform: "darwin",
    });

    expect(env.APPLE_SIGNING_IDENTITY).toBe("Explicit Identity");
  });

  test("selects the first installed identity for a macOS QA build", () => {
    const env: Record<string, string> = {};

    configureMacQaSigning({
      args: ["build", "--config", "src-tauri/tauri.qa.conf.json"],
      env,
      platform: "darwin",
      findIdentities: () => ["Apple Development: Stable Identity (TEAM)"],
    });

    expect(env.APPLE_SIGNING_IDENTITY).toBe(
      "Apple Development: Stable Identity (TEAM)",
    );
  });

  test("rejects an unsigned macOS QA build", () => {
    expect(() =>
      configureMacQaSigning({
        args: ["build", "--config", "src-tauri/tauri.qa.conf.json"],
        env: {},
        platform: "darwin",
        findIdentities: () => [],
      }),
    ).toThrow("requires an Apple Development signing identity");
  });
});
