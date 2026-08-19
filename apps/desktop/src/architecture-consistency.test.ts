import {
  formatViolations,
  runArchitectureCheck,
} from "@looper/architecture-check";
import { describe, expect, it } from "vitest";
import { architectureConfig } from "../architecture.config";

describe("desktop architecture", () => {
  it("passes every declared architecture rule", () => {
    expect(formatViolations(runArchitectureCheck(architectureConfig))).toEqual(
      [],
    );
  });
});
