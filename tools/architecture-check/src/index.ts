// Shared architecture checker for TypeScript applications.
//
// The engine is intentionally small: regexes over import specifiers plus file
// metrics — no AST. It generalizes the regex checks that historically lived in
// apps/web/src/architecture-consistency.test.ts. Each app declares its rules
// in an `architecture.config.ts` and a thin vitest invokes the engine through
// the normal `pnpm test` run.
//
// Every violation carries a stable code (e.g. WEB-THIN-ROUTE) so failures are
// greppable and documentable.

import { readdirSync, readFileSync } from "node:fs";
import { dirname, extname, join, relative } from "node:path";

export interface Violation {
  code: string;
  file: string;
  detail: string;
}

export interface SourceFile {
  /** Path relative to the config root, always with forward slashes. */
  path: string;
  absolutePath: string;
  source: string;
  lines: number;
  imports: string[];
}

interface BaseRule {
  code: string;
  /**
   * When true, the rule must match at least one file; zero matches emit a
   * RULE-NO-FILES violation so a deleted or renamed directory cannot silently
   * disable the rule. Ignored for custom rules, which own their file scoping.
   */
  expectFiles?: boolean;
}

/** Files matching `include` stay small and match/avoid content patterns. */
export interface ThinFileRule extends BaseRule {
  kind: "thin-file";
  include: RegExp;
  maxLines: number;
  requiredPatterns?: RegExp[];
  forbiddenPatterns?: RegExp[];
  /** Grandfathered files that may exceed the rule; they may only shrink. */
  allowFiles?: string[];
}

/** No file in scope may import a specifier matching the rule. */
export interface NoImportRule extends BaseRule {
  kind: "no-import";
  specifier: (specifier: string) => boolean;
  include?: RegExp;
  exclude?: RegExp;
}

/**
 * Exactly the allowlisted files import the specifier — no more, no less.
 * `specifier` is the exact module specifier as parsed from import/export
 * statements (e.g. "@looper/data"); comment-only mentions do not count.
 */
export interface ImportAllowlistRule extends BaseRule {
  kind: "import-allowlist";
  specifier: string;
  allowedFiles: string[];
}

/**
 * Feature isolation: no alias deep imports into a feature (own or foreign)
 * and no relative imports escaping into another feature. Barrel imports
 * (`<aliasPrefix><feature>`) stay allowed.
 */
export interface FeatureBoundariesRule extends BaseRule {
  kind: "feature-boundaries";
  featuresPath: string;
  aliasPrefix: string;
  include?: RegExp;
}

/** Every non-test file under a hooks/ directory exports at least one hook. */
export interface HookExportsRule extends BaseRule {
  kind: "hook-exports";
  include: RegExp;
  exclude?: RegExp;
}

/**
 * Features above the flat-file threshold must declare at least one layer
 * directory (components/, hooks/, …) and a public barrel.
 */
export interface FeatureLayersRule extends BaseRule {
  kind: "feature-layers";
  featuresPath: string;
  maxFlatFiles: number;
  layerDirs: string[];
  barrel: string;
  /** Grandfathered flat features; new features must comply. */
  allowFeatures?: string[];
}

/** Escape hatch for app-specific checks that reuse the scanned file set. */
export interface CustomRule extends BaseRule {
  kind: "custom";
  check: (context: RuleContext) => Violation[];
}

export type Rule =
  | ThinFileRule
  | NoImportRule
  | ImportAllowlistRule
  | FeatureBoundariesRule
  | HookExportsRule
  | FeatureLayersRule
  | CustomRule;

export interface ArchitectureConfig {
  /** Absolute path to the directory the rules are scoped to. */
  root: string;
  rules: Rule[];
}

export interface RuleContext {
  root: string;
  files: SourceFile[];
}

const SOURCE_EXTENSIONS = new Set([".ts", ".tsx"]);
const staticImportPattern =
  /\b(?:import|export)\s+(?:type\s+)?(?:[^"';]+?\s+from\s+)?["']([^"']+)["']/g;
const dynamicImportPattern = /\bimport\s*\(\s*["']([^"']+)["']\s*\)/g;
const hookExportPattern =
  /export\s+(?:async\s+)?(?:function|const|let)\s+use[A-Z]|export\s*\{[^}]*\buse[A-Z]/;

export function collectImportSpecifiers(source: string): string[] {
  return [...source.matchAll(staticImportPattern), ...source.matchAll(dynamicImportPattern)]
    .map((match) => match[1])
    .filter((specifier): specifier is string => Boolean(specifier));
}

export function collectSourceFiles(root: string): SourceFile[] {
  const files: SourceFile[] = [];

  function walk(directory: string): void {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const absolutePath = join(directory, entry.name);
      if (entry.isDirectory()) {
        if (entry.name === "node_modules") continue;
        walk(absolutePath);
        continue;
      }
      if (!SOURCE_EXTENSIONS.has(extname(entry.name))) continue;
      const source = readFileSync(absolutePath, "utf8");
      files.push({
        path: normalize(relative(root, absolutePath)),
        absolutePath,
        source,
        lines: source.split("\n").length,
        imports: collectImportSpecifiers(source),
      });
    }
  }

  walk(root);
  return files.sort((left, right) => left.path.localeCompare(right.path));
}

export function runArchitectureCheck(config: ArchitectureConfig): Violation[] {
  const context: RuleContext = { root: config.root, files: collectSourceFiles(config.root) };
  return config.rules.flatMap((rule) => checkRule(rule, context));
}

export function formatViolations(violations: Violation[]): string[] {
  return violations.map((violation) => `${violation.code} ${violation.file} — ${violation.detail}`);
}

function checkRule(rule: Rule, context: RuleContext): Violation[] {
  const violations = evaluateRule(rule, context);
  if (rule.expectFiles && rule.kind !== "custom" && countMatchedFiles(rule, context) === 0) {
    return [
      {
        code: "RULE-NO-FILES",
        file: rule.code,
        detail: `rule matched no files under ${context.root} — the enforced directory is missing or empty`,
      },
      ...violations,
    ];
  }
  return violations;
}

function countMatchedFiles(rule: Exclude<Rule, CustomRule>, context: RuleContext): number {
  switch (rule.kind) {
    case "thin-file":
      return context.files.filter((file) => rule.include.test(file.path)).length;
    case "no-import":
    case "hook-exports":
      return scopedFiles(context, rule.include, rule.exclude).length;
    case "feature-boundaries":
      return scopedFiles(context, rule.include).length;
    case "feature-layers":
      return context.files.filter((file) => file.path.startsWith(`${rule.featuresPath}/`)).length;
    case "import-allowlist":
      return context.files.filter((file) => file.imports.includes(rule.specifier)).length;
  }
}

function evaluateRule(rule: Rule, context: RuleContext): Violation[] {
  switch (rule.kind) {
    case "thin-file":
      return checkThinFile(rule, context);
    case "no-import":
      return checkNoImport(rule, context);
    case "import-allowlist":
      return checkImportAllowlist(rule, context);
    case "feature-boundaries":
      return checkFeatureBoundaries(rule, context);
    case "hook-exports":
      return checkHookExports(rule, context);
    case "feature-layers":
      return checkFeatureLayers(rule, context);
    case "custom":
      return rule.check(context);
  }
}

function checkThinFile(rule: ThinFileRule, context: RuleContext): Violation[] {
  const allowed = new Set(rule.allowFiles ?? []);
  return context.files
    .filter((file) => rule.include.test(file.path))
    .flatMap((file) => {
      const violations: Violation[] = [];
      if (file.lines > rule.maxLines && !allowed.has(file.path)) {
        violations.push({
          code: rule.code,
          file: file.path,
          detail: `${file.lines} lines exceeds the ${rule.maxLines}-line budget`,
        });
      }
      for (const pattern of rule.requiredPatterns ?? []) {
        if (!pattern.test(file.source)) {
          violations.push({
            code: rule.code,
            file: file.path,
            detail: `missing required pattern ${pattern}`,
          });
        }
      }
      for (const pattern of rule.forbiddenPatterns ?? []) {
        if (pattern.test(file.source)) {
          violations.push({
            code: rule.code,
            file: file.path,
            detail: `matches forbidden pattern ${pattern}`,
          });
        }
      }
      return violations;
    });
}

function checkNoImport(rule: NoImportRule, context: RuleContext): Violation[] {
  return scopedFiles(context, rule.include, rule.exclude).flatMap((file) =>
    file.imports.filter(rule.specifier).map((specifier) => ({
      code: rule.code,
      file: file.path,
      detail: `imports ${specifier}`,
    })),
  );
}

function checkImportAllowlist(rule: ImportAllowlistRule, context: RuleContext): Violation[] {
  const allowed = new Set(rule.allowedFiles);
  const importers = new Set(
    context.files.filter((file) => file.imports.includes(rule.specifier)).map((file) => file.path),
  );

  const violations: Violation[] = [];
  for (const path of importers) {
    if (!allowed.has(path)) {
      violations.push({
        code: rule.code,
        file: path,
        detail: `imports ${rule.specifier} but is not allowlisted`,
      });
    }
  }
  for (const path of allowed) {
    if (!importers.has(path)) {
      violations.push({
        code: rule.code,
        file: path,
        detail: `allowlisted for ${rule.specifier} but no longer imports it — remove the stale entry`,
      });
    }
  }
  return violations;
}

function checkFeatureBoundaries(rule: FeatureBoundariesRule, context: RuleContext): Violation[] {
  const featurePathPattern = new RegExp(`^${escapeRegExp(rule.featuresPath)}/([^/]+)/`);
  const aliasDeepPattern = new RegExp(`^${escapeRegExp(rule.aliasPrefix)}([^/]+)/`);

  return scopedFiles(context, rule.include).flatMap((file) => {
    const currentFeature = featurePathPattern.exec(file.path)?.[1] ?? null;

    return file.imports.flatMap((specifier) => {
      const aliasedFeature = aliasDeepPattern.exec(specifier)?.[1];
      if (aliasedFeature) {
        return [
          {
            code: rule.code,
            file: file.path,
            detail:
              currentFeature === aliasedFeature
                ? `imports its own internals through ${specifier}`
                : `deep imports feature "${aliasedFeature}" through ${specifier} — use its public barrel`,
          },
        ];
      }

      if (!specifier.startsWith(".")) return [];
      const resolved = normalize(
        relative(context.root, join(dirname(file.absolutePath), specifier)),
      );
      // No trailing slash is added: a relative import of the feature barrel
      // itself ("./features/x") resolves without a "/" and stays allowed.
      const targetFeature = featurePathPattern.exec(resolved)?.[1] ?? null;
      if (!targetFeature || targetFeature === currentFeature) return [];

      return [
        {
          code: rule.code,
          file: file.path,
          detail: `imports ${specifier} (${resolved}) across the feature boundary`,
        },
      ];
    });
  });
}

function checkHookExports(rule: HookExportsRule, context: RuleContext): Violation[] {
  return scopedFiles(context, rule.include, rule.exclude)
    .filter((file) => !hookExportPattern.test(file.source))
    .map((file) => ({
      code: rule.code,
      file: file.path,
      detail: "does not export a use[A-Z]… hook; move non-hook logic out of hooks/",
    }));
}

function checkFeatureLayers(rule: FeatureLayersRule, context: RuleContext): Violation[] {
  const allowed = new Set(rule.allowFeatures ?? []);
  const prefix = `${rule.featuresPath}/`;
  const featureFiles = new Map<string, SourceFile[]>();

  for (const file of context.files) {
    if (!file.path.startsWith(prefix)) continue;
    const feature = file.path.slice(prefix.length).split("/")[0];
    if (!feature || feature.includes(".")) continue;
    featureFiles.set(feature, [...(featureFiles.get(feature) ?? []), file]);
  }

  return [...featureFiles.entries()].flatMap(([feature, files]) => {
    if (allowed.has(feature)) return [];
    const violations: Violation[] = [];
    const featureRoot = `${prefix}${feature}/`;

    if (!files.some((file) => file.path === `${featureRoot}${rule.barrel}`)) {
      violations.push({
        code: rule.code,
        file: featureRoot,
        detail: `feature has no public barrel (${rule.barrel})`,
      });
    }

    if (files.length > rule.maxFlatFiles) {
      const hasLayer = rule.layerDirs.some((layer) =>
        files.some((file) => file.path.startsWith(`${featureRoot}${layer}/`)),
      );
      if (!hasLayer) {
        violations.push({
          code: rule.code,
          file: featureRoot,
          detail:
            `${files.length} files exceed the flat-feature budget of ${rule.maxFlatFiles} — ` +
            `introduce ${rule.layerDirs.map((layer) => `${layer}/`).join(" or ")}`,
        });
      }
    }
    return violations;
  });
}

function scopedFiles(context: RuleContext, include?: RegExp, exclude?: RegExp): SourceFile[] {
  return context.files.filter(
    (file) => (!include || include.test(file.path)) && !exclude?.test(file.path),
  );
}

function normalize(path: string): string {
  return path.replaceAll("\\", "/");
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
