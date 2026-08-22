import { describe, expect, it } from "vitest";

const sources = (
  import.meta as unknown as {
    glob: (
      pattern: string,
      options: { eager: boolean; import: string; query: string },
    ) => Record<string, string>;
  }
).glob("../**/*.ts", { eager: true, import: "default", query: "?raw" });

const productionSources = Object.entries(sources).filter(
  ([path]) => !path.endsWith(".test.ts") && !path.includes("/_generated/"),
);

function matchingFiles(pattern: RegExp): string[] {
  return productionSources
    .filter(([, source]) => pattern.test(source))
    .map(([path]) => path)
    .sort();
}

describe("Convex deployability gate", () => {
  it("does not dynamically import modules", () => {
    expect(matchingFiles(/(?<!typeof\s)\bimport\s*\(/)).toEqual([]);
  });

  it("does not import Vitest from deployable modules", () => {
    expect(
      matchingFiles(
        /(?:from\s+["']vitest["']|import\s*\(\s*["']vitest["']\s*\)|require\s*\(\s*["']vitest["']\s*\))/,
      ),
    ).toEqual([]);
  });
});
