// Architecture rules for the web app, evaluated by the shared checker in
// tools/architecture-check. Violation codes are stable identifiers.

import { dirname, join, relative } from "node:path";
import {
  type ArchitectureConfig,
  collectImportSpecifiers,
  collectSourceFiles,
  type Violation,
} from "@looper/architecture-check";

const sourceRoot = join(import.meta.dirname, "src");
const workspaceRoot = join(import.meta.dirname, "..", "..");
const dataSourceRoot = join(workspaceRoot, "packages/ts/data/src");
const dataConvexAdapterPrefix = "adapters/convex/";

// Flat features that predate WEB-FEATURE-LAYERS. The list may shrink but must
// not grow; entries whose module is pruned simply become inert.
const grandfatheredFlatFeatures = ["demo", "desktop", "marketing", "realtime"];

function isConvexRuntimeImport(specifier: string): boolean {
  return specifier === "convex/react" || specifier.startsWith("@looper/backend/convex/_generated/");
}

// A relative import from the data package must never resolve into apps/ —
// exported for the regression test in src/architecture-consistency.test.ts.
export function dataRelativeImportEscapesToApps(
  fileAbsolutePath: string,
  specifier: string,
): boolean {
  if (!specifier.startsWith(".")) return false;
  const resolved = relative(workspaceRoot, join(dirname(fileAbsolutePath), specifier)).replaceAll(
    "\\",
    "/",
  );
  return resolved.startsWith("apps/");
}

// The shared data package stays app-agnostic and confines Convex to its
// adapter. It lives outside apps/web, so this runs as a custom rule against
// its own root instead of the scanned web file set.
function checkDataPackageBoundary(): Violation[] {
  return collectSourceFiles(dataSourceRoot).flatMap((file) =>
    collectImportSpecifiers(file.source).flatMap((specifier) => {
      if (isConvexRuntimeImport(specifier) && !file.path.startsWith(dataConvexAdapterPrefix)) {
        return [
          {
            code: "WEB-DATA-BOUNDARY",
            file: `packages/ts/data/src/${file.path}`,
            detail: `imports ${specifier} outside the Convex adapter`,
          },
        ];
      }
      if (
        specifier.startsWith("@/") ||
        specifier.startsWith("@looper/web") ||
        dataRelativeImportEscapesToApps(file.absolutePath, specifier)
      ) {
        return [
          {
            code: "WEB-DATA-BOUNDARY",
            file: `packages/ts/data/src/${file.path}`,
            detail: `imports app code through ${specifier}`,
          },
        ];
      }
      return [];
    }),
  );
}

export const architectureConfig: ArchitectureConfig = {
  root: sourceRoot,
  rules: [
    {
      code: "WEB-THIN-ROUTE",
      kind: "thin-file",
      expectFiles: true,
      include: /^routes\/[^/]+\.tsx$/,
      maxLines: 39,
      requiredPatterns: [/create(?:File|Root)Route/, /from "@\/(app|features)\//],
      forbiddenPatterns: [/from "@looper\/data"/, /from "@looper\/i18n/],
    },
    {
      code: "WEB-NO-CONVEX-IN-FEATURES",
      kind: "no-import",
      specifier: isConvexRuntimeImport,
    },
    {
      code: "WEB-FEATURE-BARREL",
      kind: "feature-boundaries",
      featuresPath: "features",
      aliasPrefix: "@/features/",
    },
    {
      code: "WEB-HOOKS-EXPORT",
      kind: "hook-exports",
      include: /(^|\/)hooks\/[^/]+\.tsx?$/,
      exclude: /\.(test|spec)\.tsx?$|\.d\.ts$/,
    },
    {
      code: "WEB-FEATURE-LAYERS",
      kind: "feature-layers",
      expectFiles: true,
      featuresPath: "features",
      maxFlatFiles: 5,
      layerDirs: ["components", "hooks", "application"],
      barrel: "index.ts",
      allowFeatures: grandfatheredFlatFeatures,
    },
    { code: "WEB-DATA-BOUNDARY", kind: "custom", check: checkDataPackageBoundary },
  ],
};
