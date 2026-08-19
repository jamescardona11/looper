// Architecture rules for the Convex backend, evaluated by the shared checker
// in tools/architecture-check. Violation codes are stable identifiers, in line
// with the web (WEB-*) config.

import { dirname, join, relative } from "node:path";
import type { ArchitectureConfig, RuleContext, Violation } from "@looper/architecture-check";

const convexRoot = join(import.meta.dirname, "convex");
const workspaceRoot = join(import.meta.dirname, "..");

// Feature domains under backend/convex that must stay isolated from each
// other. They may only share code through lib/, _generated, or the root-level
// orchestration files (schema.ts, env.ts, retrier.ts, users.ts, …).
// Every folder under backend/convex that exposes public functions belongs here,
// or it silently escapes BOTH rules below. Verified against the tree: these nine
// plus `notes` are the folders declaring `query(`/`mutation(`/`action(`.
const domains = [
  "payments",
  "agent",
  "stt",
  "userKeys",
  "dictation",
  "feedback",
  "onboarding",
  "waitlist",
  "meetings",
  "notes",
] as const;

// Measured cross-domain imports that exist today. Each entry grandfathers one
// importing file into one target domain; the list may shrink but must not
// grow. agent/credits.ts wraps the payments credit ledger for agent metering.
const allowedCrossDomainImports = [{ from: "agent/credits.ts", to: "payments" }];

// Waitlist is intentionally callable before authentication.
const publicAuthExemptDomains = new Set(["waitlist"]);

// Workspace packages the backend legitimately depends on (see package.json).
// Everything else under packages/ts, and anything under apps/, is app-layer
// code the backend must not reach into.
const allowedWorkspaceImportPrefixes = ["@looper/config"];

const generatedOrTestFile = /(^|\/)_generated\/|\.(test|spec)\.tsx?$/;

function domainOf(path: string): string | null {
  const first = path.split("/")[0];
  return domains.includes(first as (typeof domains)[number]) ? (first as string) : null;
}

function resolveRelative(fileAbsolutePath: string, specifier: string): string {
  return relative(convexRoot, join(dirname(fileAbsolutePath), specifier)).replaceAll("\\", "/");
}

function checkDomainIsolation(context: RuleContext): Violation[] {
  return context.files
    .filter((file) => !generatedOrTestFile.test(file.path) && domainOf(file.path) !== null)
    .flatMap((file) => {
      const currentDomain = domainOf(file.path);
      return file.imports.flatMap((specifier) => {
        if (!specifier.startsWith(".")) return [];
        const targetDomain = domainOf(resolveRelative(file.absolutePath, specifier));
        if (!targetDomain || targetDomain === currentDomain) return [];
        if (
          allowedCrossDomainImports.some(
            (entry) => entry.from === file.path && entry.to === targetDomain,
          )
        ) {
          return [];
        }
        return [
          {
            code: "BE-DOMAIN-ISOLATION",
            file: file.path,
            detail: `imports ${specifier} from domain "${targetDomain}" — domains only share code via lib/, _generated, or root files`,
          },
        ];
      });
    });
}

function checkNoAppImport(context: RuleContext): Violation[] {
  return context.files
    .filter((file) => !generatedOrTestFile.test(file.path))
    .flatMap((file) =>
      file.imports.flatMap((specifier) => {
        if (specifier.startsWith("@looper/")) {
          const allowed = allowedWorkspaceImportPrefixes.some(
            (prefix) => specifier === prefix || specifier.startsWith(`${prefix}/`),
          );
          return allowed
            ? []
            : [
                {
                  code: "BE-NO-APP-IMPORT",
                  file: file.path,
                  detail: `imports ${specifier} — the backend may only depend on ${allowedWorkspaceImportPrefixes.join(", ")}`,
                },
              ];
        }
        if (!specifier.startsWith(".")) return [];
        const resolvedFromWorkspace = relative(
          workspaceRoot,
          join(dirname(file.absolutePath), specifier),
        ).replaceAll("\\", "/");
        if (
          resolvedFromWorkspace.startsWith("apps/") ||
          resolvedFromWorkspace.startsWith("packages/")
        ) {
          return [
            {
              code: "BE-NO-APP-IMPORT",
              file: file.path,
              detail: `imports ${specifier} (${resolvedFromWorkspace}) — layering goes apps → backend, never the reverse`,
            },
          ];
        }
        return [];
      }),
    );
}

// Public (non-internal) mutations/queries in user-facing domains must carry an
// auth guard. The check reasons per function, not per file: a file with five
// mutations where only one calls getAuthUserId used to pass wholesale.
//
// Segmentation is textual, not an AST walk. A block runs from the
// `export const name = mutation(` line to the first line starting with `})`,
// which is where Biome closes a top-level call expression. Convex functions in
// this repo are all written that shape; a hand-formatted file that closes the
// call some other way would make the block run long and could mask a missing
// guard (a false negative, never a false positive).
const publicFunctionPattern = /^export\s+const\s+([A-Za-z0-9_$]+)\s*=\s*(?:mutation|query)\(/gm;
const topLevelDefinitionPattern =
  /^(?:export\s+)?(?:async\s+)?function\s+([A-Za-z0-9_$]+)|^(?:export\s+)?const\s+([A-Za-z0-9_$]+)\s*=\s*(?:async\s*)?\(/gm;
const blockEndPattern = /^\}\)/m;
// A top-level HELPER never closes on `})` — a `function` body closes on `}` and
// an arrow const on `};`. Terminating a helper's block with the Convex pattern
// ran it on into the following mutation, so a pure helper (a string validator,
// say) inherited that mutation's `getAuthUserId` and was classified as a guard.
// Any public function calling it then passed the rule with no guard at all.
const helperBlockEndPattern =
  /^\}|^(?:export\s+)?(?:async\s+)?(?:const|function|type|interface)\s/m;
const authGuardPattern = /getAuthUserId|requireAdmin/;

function blockAt(source: string, index: number): string {
  const rest = source.slice(index);
  const end = rest.search(blockEndPattern);
  return end === -1 ? rest : rest.slice(0, end);
}

// Same idea for a helper, but bounded by its own closing brace or the next
// top-level declaration, whichever comes first (skipping its own first line).
function helperBlockAt(source: string, index: number): string {
  const rest = source.slice(index);
  const bodyStart = rest.indexOf("\n") + 1;
  if (bodyStart <= 0) return rest;
  const end = rest.slice(bodyStart).search(helperBlockEndPattern);
  return end === -1 ? rest : rest.slice(0, bodyStart + end);
}

// A handler may delegate its guard to a same-file helper (payments'
// getActiveSubscription is the live example). Collect the helpers that
// themselves reach a guard, then treat a call to one as a guard.
function localGuardHelpers(source: string): string[] {
  const definitions = [...source.matchAll(topLevelDefinitionPattern)].map((match) => ({
    name: match[1] ?? match[2] ?? "",
    index: match.index ?? 0,
  }));
  const guarded = new Set<string>();

  for (let pass = 0; pass < definitions.length; pass += 1) {
    const before = guarded.size;
    for (const definition of definitions) {
      if (!definition.name || guarded.has(definition.name)) continue;
      if (guardPatternFor([...guarded]).test(helperBlockAt(source, definition.index))) {
        guarded.add(definition.name);
      }
    }
    if (guarded.size === before) break;
  }
  return [...guarded];
}

function guardPatternFor(helpers: string[]): RegExp {
  return helpers.length === 0
    ? authGuardPattern
    : new RegExp(`${authGuardPattern.source}|\\b(?:${helpers.join("|")})\\b`);
}

function checkAuthInPublicFunctions(context: RuleContext): Violation[] {
  return context.files
    .filter(
      (file) =>
        !generatedOrTestFile.test(file.path) &&
        domainOf(file.path) !== null &&
        !publicAuthExemptDomains.has(domainOf(file.path) ?? ""),
    )
    .flatMap((file) => {
      const guardPattern = guardPatternFor(localGuardHelpers(file.source));
      return [...file.source.matchAll(publicFunctionPattern)]
        .filter((match) => !guardPattern.test(blockAt(file.source, match.index ?? 0)))
        .map((match) => ({
          code: "BE-AUTH-IN-MUTATIONS",
          file: file.path,
          detail: `public function "${match[1]}" has no getAuthUserId or requireAdmin — add a guard or make it internal`,
        }));
    });
}

export const architectureConfig: ArchitectureConfig = {
  root: convexRoot,
  rules: [
    { code: "BE-DOMAIN-ISOLATION", kind: "custom", check: checkDomainIsolation },
    { code: "BE-NO-APP-IMPORT", kind: "custom", check: checkNoAppImport },
    { code: "BE-AUTH-IN-MUTATIONS", kind: "custom", check: checkAuthInPublicFunctions },
  ],
};
