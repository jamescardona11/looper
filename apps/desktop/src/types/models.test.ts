import { describe, expect, test } from "vitest";
import { LOCAL_LLM_MODEL_STATES, type DownloadEvent } from "./models";

describe("model contracts", () => {
  test("keeps every native local model state available", () => {
    expect(LOCAL_LLM_MODEL_STATES).toEqual([
      "not_installed",
      "downloading",
      "verifying",
      "ready",
      "runtime_error",
      "license_required",
    ]);
  });

  test("requires error details while sharing progress across download states", () => {
    const event: DownloadEvent = {
      status: "error",
      percent: 42,
      message: "Network unavailable",
    };
    expect(event).toMatchObject({ status: "error", percent: 42 });
  });
});
