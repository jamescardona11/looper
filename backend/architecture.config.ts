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
// auth guard. File-level heuristic: any domain file defining `mutation(` or
// `query(` must reference getAuthUserId or requireAdmin somewhere.
const publicFunctionPattern = /=\s*(mutation|query)\(/;
const authGuardPattern = /getAuthUserId|requireAdmin/;

function checkAuthInPublicFunctions(context: RuleContext): Violation[] {
  return context.files
    .filter(
      (file) =>
        !generatedOrTestFile.test(file.path) &&
        domainOf(file.path) !== null &&
        !publicAuthExemptDomains.has(domainOf(file.path) ?? "") &&
        publicFunctionPattern.test(file.source) &&
        !authGuardPattern.test(file.source),
    )
    .map((file) => ({
      code: "BE-AUTH-IN-MUTATIONS",
      file: file.path,
      detail:
        "defines a public mutation/query without getAuthUserId or requireAdmin — add a guard or make it internal",
    }));
}

export const architectureConfig: ArchitectureConfig = {
  root: convexRoot,
  rules: [
    { code: "BE-DOMAIN-ISOLATION", kind: "custom", check: checkDomainIsolation },
    { code: "BE-NO-APP-IMPORT", kind: "custom", check: checkNoAppImport },
    { code: "BE-AUTH-IN-MUTATIONS", kind: "custom", check: checkAuthInPublicFunctions },
  ],
};
