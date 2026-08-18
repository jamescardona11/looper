// Turn raw backend/Convex errors into short, human messages for toasts and
// inline UI. Convex surfaces server errors as
//   "[CONVEX A(auth:signIn)] [Request ID: ...] Server Error\nUncaught Error: <msg> at <stack>"
// which is useless to a user — we extract the core and map known cases.
//
import { i18n, type TranslationKey } from "@looper/i18n";
import { captureError } from "./analytics";

const FRIENDLY: { match: RegExp; messageKey: TranslationKey }[] = [
  {
    match: /could not verify code|invalid code|incorrect code|code is invalid/i,
    messageKey: "errors.invalidCode",
  },
  {
    match: /RESEND_API_KEY|email sign-in.*not configured/i,
    messageKey: "errors.emailUnavailable",
  },
  {
    match: /OPENAI_API_KEY|no openai api key/i,
    messageKey: "errors.aiNotConfigured",
  },
  {
    match: /must be signed in|unauthenticated|not authenticated/i,
    messageKey: "errors.signInRequired",
  },
  {
    match: /rate limit|too many/i,
    messageKey: "errors.rateLimited",
  },
  {
    match: /failed to fetch|network|timeout|offline/i,
    messageKey: "errors.network",
  },
];

function extractCore(raw: string): string {
  // Pull the message after the last "Error:" marker, then drop the stack trace.
  const errMatch = raw.match(/(?:Uncaught\s+\w*Error|Error):\s*([\s\S]*)/);
  const afterError = errMatch?.[1] ?? raw;
  const beforeStack = afterError.split(/\n\s*at\s|\s+at\s/)[0] ?? afterError;
  return beforeStack.trim();
}

export function friendlyError(error: unknown, fallback = i18n.t("errors.generic")): string {
  const raw = error instanceof Error ? error.message : typeof error === "string" ? error : "";
  if (!raw) return fallback;
  for (const f of FRIENDLY) {
    if (f.match.test(raw)) return i18n.t(f.messageKey);
  }
  const core = extractCore(raw);
  // If we still have Convex plumbing in the string, don't show it.
  if (!core || /Request ID|Server Error/i.test(core)) return fallback;
  return core.length > 140 ? `${core.slice(0, 137)}…` : core;
}

export interface ReportOptions {
  /** Override the default user-facing fallback message. */
  fallback?: string;
  /** Send the error to telemetry. Defaults to true; pass false for benign/expected errors. */
  capture?: boolean;
  /** Extra context attached to the telemetry event. */
  context?: Record<string, unknown>;
}

// Report an error to telemetry AND produce a user-facing message in one call.
// Catch handlers previously had to remember both captureError() (observability)
// and friendlyError() (UX) — and in practice dropped the telemetry half. This
// pairs them behind one seam so a catch site does the right thing by default.
// A bare string second arg is shorthand for { fallback }, making reportError a
// drop-in for friendlyError that also reports.
export function reportError(error: unknown, opts: string | ReportOptions = {}): string {
  const {
    fallback,
    capture = true,
    context,
  } = typeof opts === "string" ? { fallback: opts } : opts;
  if (capture) captureError(error, context);
  return friendlyError(error, fallback);
}
