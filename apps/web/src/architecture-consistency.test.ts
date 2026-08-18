import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { formatViolations, runArchitectureCheck } from "@looper/architecture-check";
import { describe, expect, it } from "vitest";
import { architectureConfig, dataRelativeImportEscapesToApps } from "../architecture.config";

describe("web architecture", () => {
  it("passes every declared architecture rule", () => {
    expect(formatViolations(runArchitectureCheck(architectureConfig))).toEqual([]);
  });

  it("flags relative imports from the data package that resolve into apps/", () => {
    const dataFile = join(import.meta.dirname, "../../../packages/ts/data/src/hooks/use-x.ts");
    expect(dataRelativeImportEscapesToApps(dataFile, "../../../../../apps/web/src/main")).toBe(
      true,
    );
    expect(dataRelativeImportEscapesToApps(dataFile, "../types")).toBe(false);
    expect(dataRelativeImportEscapesToApps(dataFile, "@looper/config")).toBe(false);
  });

  it("routes every page root through PageSurface", () => {
    const sourceRoot = import.meta.dirname;
    const offenders = readdirSync(sourceRoot, { recursive: true })
      .map(String)
      .filter(
        (file) => /\.(ts|tsx)$/.test(file) && !file.endsWith("architecture-consistency.test.ts"),
      )
      .filter((file) => file !== "shared/components/page-surface.tsx")
      .flatMap((file) => {
        const source = readFileSync(join(sourceRoot, file), "utf8");
        return source.includes("<main") ? [file] : [];
      });

    expect(
      offenders,
      `Use PageSurface so product colors and typography stay centralized:\n${offenders.join("\n")}`,
    ).toEqual([]);
  });
});
