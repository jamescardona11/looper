// @vitest-environment node
// The shared checker walks the filesystem with node:fs, which the default
// edge-runtime environment does not provide.

import { formatViolations, runArchitectureCheck } from "@looper/architecture-check";
import { describe, expect, it } from "vitest";
import { architectureConfig } from "../architecture.config";

describe("backend architecture", () => {
  it("passes every declared architecture rule", () => {
    expect(formatViolations(runArchitectureCheck(architectureConfig))).toEqual([]);
  });
});
