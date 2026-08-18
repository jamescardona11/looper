import { describe, expect, it } from "vitest";
import {
  autoLaunchThumbClassName,
  autoLaunchTrackClassName,
  insertionEvidenceIsValid,
} from "./ready-step-policy";

describe("ready-step-policy", () => {
  it("accepts insertion only when all native and field evidence agrees", () => {
    expect(insertionEvidenceIsValid({ chars: 4, can_undo: true }, "text")).toBe(
      true,
    );
    expect(insertionEvidenceIsValid({ chars: 0, can_undo: true }, "text")).toBe(
      false,
    );
    expect(
      insertionEvidenceIsValid({ chars: 4, can_undo: false }, "text"),
    ).toBe(false);
    expect(insertionEvidenceIsValid({ chars: 4, can_undo: true }, "  ")).toBe(
      false,
    );
  });

  it("places the auto-launch thumb on the side matching its state", () => {
    expect(autoLaunchTrackClassName(true)).toContain("bg-emerald-500");
    expect(autoLaunchTrackClassName(false)).toContain("bg-surface-hover");
    expect(autoLaunchThumbClassName(true)).toContain("right-0.5");
    expect(autoLaunchThumbClassName(false)).toContain("left-0.5");
  });
});
