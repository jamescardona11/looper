export type FrontendCrashSource =
  "render" | "window_error" | "unhandled_rejection";

type FrontendCrashEvent = {
  windowLabel: string;
  source: FrontendCrashSource;
  errorKind: string;
  fingerprint: string;
};

type CrashReporterOptions = {
  disabled: boolean;
  getWindowLabel: () => string;
  send: (event: FrontendCrashEvent) => Promise<unknown>;
};

export type FrontendCrashReporter = (
  source: FrontendCrashSource,
  error: unknown,
  componentStack?: string,
) => void;

const knownErrorKinds = new Set([
  "Error",
  "TypeError",
  "RangeError",
  "ReferenceError",
  "SyntaxError",
]);

export function createFrontendCrashReporter({
  disabled,
  getWindowLabel,
  send,
}: CrashReporterOptions): FrontendCrashReporter {
  const sentFingerprints = new Set<string>();

  return (source, error, componentStack = "") => {
    if (disabled) return;
    const fingerprint = fingerprintCrash(error, componentStack);
    const eventKey = `${source}:${fingerprint}`;
    if (sentFingerprints.has(eventKey)) return;

    sentFingerprints.add(eventKey);
    void send({
      windowLabel: getWindowLabel(),
      source,
      errorKind: classifyError(error),
      fingerprint,
    }).catch(() => undefined);
  };
}

export function monitorGlobalCrashes(
  target: Window,
  report: FrontendCrashReporter,
) {
  const reportWindowError = (event: ErrorEvent) => {
    if (event.error != null) report("window_error", event.error);
  };
  const reportRejectedPromise = (event: PromiseRejectionEvent) => {
    if (event.reason != null) report("unhandled_rejection", event.reason);
  };

  target.addEventListener("error", reportWindowError);
  target.addEventListener("unhandledrejection", reportRejectedPromise);

  return () => {
    target.removeEventListener("error", reportWindowError);
    target.removeEventListener("unhandledrejection", reportRejectedPromise);
  };
}

export function classifyError(error: unknown) {
  return error instanceof Error && knownErrorKinds.has(error.name)
    ? error.name
    : "unknown";
}

export function fingerprintCrash(error: unknown, componentStack = "") {
  const description =
    error instanceof Error
      ? [error.name, error.stack ?? "", componentStack].join("\n")
      : ["nonerror", describeUnknown(error), componentStack].join("\n");
  let fingerprint = 0x811c9dc5;
  for (const character of description) {
    fingerprint ^= character.charCodeAt(0);
    fingerprint = Math.imul(fingerprint, 0x01000193);
  }
  return (fingerprint >>> 0).toString(16).padStart(8, "0");
}

function describeUnknown(value: unknown) {
  if (typeof value === "string") return value.slice(0, 256);
  if (value === null || typeof value !== "object") {
    return String(value).slice(0, 256);
  }

  const objectName = value.constructor?.name ?? "Object";
  const visibleKeys = Object.keys(value).sort().slice(0, 5);
  return visibleKeys.length === 0
    ? objectName
    : `${objectName}:{${visibleKeys.join(",")}}`;
}
