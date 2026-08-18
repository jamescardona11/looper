import { beforeEach, describe, expect, test, vi } from "vitest";

const invoke = vi.hoisted(() => vi.fn());
vi.mock("@tauri-apps/api/core", () => ({ invoke }));

import {
  acceptSuggestedCorrection,
  dismissSuggestedCorrection,
  getSuggestedCorrections,
} from "./corrections";

describe("correction learning native gateway", () => {
  beforeEach(() => invoke.mockReset());

  test("loads, accepts, and dismisses correction pairs", async () => {
    invoke.mockResolvedValue([]);

    await getSuggestedCorrections();
    await acceptSuggestedCorrection("teh", "the");
    await dismissSuggestedCorrection("adress", "address");

    expect(invoke.mock.calls).toEqual([
      ["get_suggested_corrections"],
      ["accept_suggested_correction", { from: "teh", to: "the" }],
      ["dismiss_suggested_correction", { from: "adress", to: "address" }],
    ]);
  });
});
