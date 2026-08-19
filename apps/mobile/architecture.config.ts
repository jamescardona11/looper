// Architecture rules for the mobile app, evaluated by the shared checker in
// tools/architecture-check. Violation codes are stable identifiers, in line
// with the web (WEB-*), backend (BE-*) and desktop (DESKTOP-*) configs.
//
// Mobile is small, so the rules protect the invariants that keep it small:
// the backend is reached only through @looper/data, expo-router files stay
// thin route shells, and features are consumed through their barrel.

import { dirname, join, relative } from "node:path";
import type { ArchitectureConfig, RuleContext, Violation } from "@looper/architecture-check";

const sourceRoot = join(import.meta.dirname, "src");

// Deep imports into a feature that exist today, one entry per (file, target
// feature). The list may shrink but must not grow; entries whose file is
// deleted simply become inert. `app/_layout.tsx` mounts three background sync
// components that no barrel exports yet.
const grandfatheredDeepFeatureImports = [
  { from: "app/_layout.tsx", to: "dictation" },
  { from: "app/_layout.tsx", to: "keyboard" },
  { from: "app/_layout.tsx", to: "library" },
  { from: "app/(app)/dictation.tsx", to: "dictation" },
  { from: "app/(app)/keyboard.tsx", to: "keyboard" },
  { from: "features/keyboard/sync-keyboard-content.ts", to: "dictation" },
  { from: "features/library/local-content-sync.tsx", to: "notes" },
];

// Features without a public barrel today. The list may shrink but must not
// grow; a new feature declares index.ts from the start.
const grandfatheredBarrellessFeatures = ["keyboard"];

const featurePathPattern = /^features\/([^/]+)\//;

function featureOf(path: string): string | null {
  return featurePathPattern.exec(path)?.[1] ?? null;
}

function resolveRelative(fileAbsolutePath: string, specifier: string): string {
  return relative(sourceRoot, join(dirname(fileAbsolutePath), specifier)).replaceAll("\\", "/");
}

// The whole point of @looper/data is that no app names the backend directly.
// Mobile has zero exceptions and must keep it that way.
function isBackendRuntimeImport(specifier: string): boolean {
  return (
    specifier === "convex" ||
    specifier.startsWith("convex/") ||
    specifier.startsWith("@convex-dev/") ||
    specifier.startsWith("@looper/backend")
  );
}

// A feature is entered through `@/features/<name>` (or a relative path to its
// barrel). Anything deeper couples a caller to the feature's file layout.
function checkFeatureBarrel(context: RuleContext): Violation[] {
  // Custom rules bypass the engine's expectFiles guard, so the rule asserts its
  // own scope: a renamed features/ must break the build rather than turn the
  // rule into a no-op.
  if (!context.files.some((file) => featureOf(file.path) !== null)) {
    return [
      {
        code: "RULE-NO-FILES",
        file: "MOBILE-FEATURE-BARREL",
        detail: `src/features/ matched no files under ${sourceRoot} — the enforced directory is missing or empty`,
      },
    ];
  }

  return context.files.flatMap((file) => {
    const currentFeature = featureOf(file.path);

    return file.imports.flatMap((specifier) => {
      const resolved = specifier.startsWith("@/")
        ? specifier.slice(2)
        : specifier.startsWith(".")
          ? resolveRelative(file.absolutePath, specifier)
          : null;
      if (resolved === null) return [];

      // No trailing slash is appended, so a barrel import ("@/features/notes")
      // resolves without a "/" and stays allowed.
      const targetFeature = featureOf(resolved);
      if (!targetFeature || targetFeature === currentFeature) return [];
      if (
        grandfatheredDeepFeatureImports.some(
          (entry) => entry.from === file.path && entry.to === targetFeature,
        )
      ) {
        return [];
      }

      return [
        {
          code: "MOBILE-FEATURE-BARREL",
          file: file.path,
          detail: `deep imports feature "${targetFeature}" through ${specifier} — use its public barrel`,
        },
      ];
    });
  });
}

export const architectureConfig: ArchitectureConfig = {
  root: sourceRoot,
  rules: [
    {
      code: "MOBILE-NO-BACKEND-IMPORT",
      kind: "no-import",
      expectFiles: true,
      specifier: isBackendRuntimeImport,
    },
    {
      // expo-router files are route shells: they re-export a feature screen and
      // wire router-level concerns. Product logic and data access live in the
      // feature. `_layout.tsx` files are the composition roots and are exempt.
      code: "MOBILE-THIN-ROUTE",
      kind: "thin-file",
      expectFiles: true,
      include: /^app\/(?!.*_layout\.tsx$).*\.tsx$/,
      maxLines: 40,
      requiredPatterns: [/export default/],
      forbiddenPatterns: [/from "@looper\/data"/],
    },
    {
      code: "MOBILE-FEATURE-LAYERS",
      kind: "feature-layers",
      expectFiles: true,
      featuresPath: "features",
      // Layer directories are not required at this size; the rule is here for
      // the barrel, which every feature must declare.
      maxFlatFiles: Number.MAX_SAFE_INTEGER,
      layerDirs: ["components", "hooks"],
      barrel: "index.ts",
      allowFeatures: grandfatheredBarrellessFeatures,
    },
    { code: "MOBILE-FEATURE-BARREL", kind: "custom", check: checkFeatureBarrel },
  ],
};
