import { describe, expect, test } from "vitest";
import { isAppSectionVisible } from "../app-section-model";

describe("app section model", () => {
  test("keeps all sections visible unless one is focused", () => {
    expect(isAppSectionVisible(undefined, "appearance")).toBe(true);
    expect(isAppSectionVisible("privacy", "privacy")).toBe(true);
    expect(isAppSectionVisible("privacy", "storage")).toBe(false);
  });
});
