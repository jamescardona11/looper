import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { after, describe, it } from "node:test";
import { runArchitectureCheck, type Violation } from "../src/index.ts";

const root = mkdtempSync(join(tmpdir(), "architecture-check-"));
after(() => rmSync(root, { recursive: true, force: true }));

function write(path: string, source: string): void {
  const absolutePath = join(root, path);
  mkdirSync(dirname(absolutePath), { recursive: true });
  writeFileSync(absolutePath, source);
}

write("routes/fat.tsx", `${'import { A } from "@/features/a";\n'.repeat(5)}createFileRoute();\n`);
write("features/a/index.ts", 'export { A } from "./a-view";\n');
write("features/a/a-view.tsx", 'import { B } from "@/features/b/internal";\nexport const A = 1;\n');
write("features/a/hooks/not-a-hook.ts", "export const helper = 1;\n");
write("features/b/internal.tsx", 'import { runtime } from "convex/react";\nexport const B = 2;\n');
write("features/b/deep.ts", 'import { A } from "../a/a-view";\nexport const C = 3;\n');
write(
  "features/b/comment-only.ts",
  '// data comes from "convex/react" via the adapter — comment-only mention\nexport const D = 4;\n',
);

const violations = runArchitectureCheck({
  root,
  rules: [
    {
      code: "X-THIN-ROUTE",
      kind: "thin-file",
      expectFiles: true,
      include: /^routes\/.*\.tsx$/,
      maxLines: 3,
      requiredPatterns: [/createFileRoute/],
      forbiddenPatterns: [/@looper\/data/],
    },
    {
      code: "X-NO-CONVEX",
      kind: "no-import",
      specifier: (specifier) => specifier === "convex/react",
    },
    {
      code: "X-FEATURE-BARREL",
      kind: "feature-boundaries",
      featuresPath: "features",
      aliasPrefix: "@/features/",
    },
    { code: "X-HOOKS-EXPORT", kind: "hook-exports", include: /\/hooks\/.*\.tsx?$/ },
    {
      code: "X-FEATURE-LAYERS",
      kind: "feature-layers",
      featuresPath: "features",
      maxFlatFiles: 1,
      layerDirs: ["components", "hooks"],
      barrel: "index.ts",
    },
    {
      code: "X-ALLOWLIST",
      kind: "import-allowlist",
      specifier: "convex/react",
      allowedFiles: ["features/b/stale.ts"],
    },
    {
      code: "X-EMPTY",
      kind: "thin-file",
      expectFiles: true,
      include: /^ghost-routes\/.*\.tsx$/,
      maxLines: 3,
    },
  ],
});

function codesFor(file: string): string[] {
  return violations
    .filter((violation: Violation) => violation.file === file)
    .map((violation) => violation.code)
    .sort();
}

describe("architecture check engine", () => {
  it("flags thin-file budget overruns but honors required patterns", () => {
    assert.deepEqual(codesFor("routes/fat.tsx"), ["X-THIN-ROUTE"]);
  });

  it("flags forbidden imports and non-allowlisted importers", () => {
    assert.deepEqual(codesFor("features/b/internal.tsx"), ["X-ALLOWLIST", "X-NO-CONVEX"]);
  });

  it("flags stale allowlist entries", () => {
    assert.deepEqual(codesFor("features/b/stale.ts"), ["X-ALLOWLIST"]);
  });

  it("ignores files that only mention the specifier in a comment", () => {
    assert.deepEqual(codesFor("features/b/comment-only.ts"), []);
  });

  it("emits RULE-NO-FILES when an expectFiles rule matches nothing", () => {
    assert.deepEqual(codesFor("X-EMPTY"), ["RULE-NO-FILES"]);
    // A satisfied expectFiles rule stays silent (X-THIN-ROUTE matched files).
    assert.deepEqual(codesFor("X-THIN-ROUTE"), []);
  });

  it("flags alias deep imports and cross-feature relative imports", () => {
    assert.deepEqual(codesFor("features/a/a-view.tsx"), ["X-FEATURE-BARREL"]);
    assert.deepEqual(codesFor("features/b/deep.ts"), ["X-FEATURE-BARREL"]);
  });

  it("flags hooks files without hook exports", () => {
    assert.deepEqual(codesFor("features/a/hooks/not-a-hook.ts"), ["X-HOOKS-EXPORT"]);
  });

  it("flags missing barrels and oversized flat features", () => {
    assert.deepEqual(codesFor("features/b/"), ["X-FEATURE-LAYERS", "X-FEATURE-LAYERS"]);
    assert.deepEqual(codesFor("features/a/"), []);
  });
});
