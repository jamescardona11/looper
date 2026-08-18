import { activateLocale } from "@looper/i18n";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { captureError } from "./analytics";
import { friendlyError, reportError } from "./errors";

// Mock the telemetry boundary so the test never loads posthog-js / @/lib/env
// (env is permission-blocked) and we can assert capture behavior.
vi.mock("./analytics", () => ({ captureError: vi.fn() }));

const FALLBACK = "Something went wrong. Please try again.";

beforeEach(() => {
  activateLocale("en");
});

// Characterization tests: these lock the CURRENT behavior of friendlyError so a
// refactor can prove equivalence. They are written against the code as-is.
describe("friendlyError — known cases (in priority order)", () => {
  it("maps invalid-code errors", () => {
    expect(friendlyError(new Error("could not verify code"))).toBe(
      "That code isn't right or has expired. Request a new one.",
    );
  });

  it("maps missing email provider config", () => {
    expect(friendlyError(new Error("RESEND_API_KEY is not configured"))).toBe(
      "Email sign-in isn't available right now.",
    );
  });

  it("maps missing OpenAI key", () => {
    expect(friendlyError(new Error("no openai api key"))).toBe(
      "AI access isn't configured yet. Add an OpenAI key in Settings → API Keys.",
    );
  });

  it("does not classify unrelated configuration errors as email failures", () => {
    expect(friendlyError(new Error("Realtime is not configured (OPENAI_API_KEY)"))).toBe(
      "AI access isn't configured yet. Add an OpenAI key in Settings → API Keys.",
    );
  });

  it("maps auth errors", () => {
    expect(friendlyError(new Error("You must be signed in"))).toBe("Please sign in to continue.");
  });

  it("maps rate-limit errors", () => {
    expect(friendlyError(new Error("rate limit exceeded"))).toBe(
      "Too many attempts. Please wait a moment and try again.",
    );
  });

  it("maps network errors", () => {
    expect(friendlyError(new Error("Failed to fetch"))).toBe(
      "Network error. Check your connection and try again.",
    );
  });

  it("returns the first matching rule when several could match (order matters)", () => {
    // "too many" (rule 5) precedes "network" (rule 6) in the table.
    expect(friendlyError(new Error("too many requests, network down"))).toBe(
      "Too many attempts. Please wait a moment and try again.",
    );
  });
});

describe("friendlyError — localized messages", () => {
  it("uses the active locale for known and generic errors", () => {
    activateLocale("es");

    expect(friendlyError(new Error("OPENAI_API_KEY not set"))).toBe(
      "El acceso a IA aún no está configurado. Agrega una clave de OpenAI en Configuración → Claves API.",
    );
    expect(friendlyError(null)).toBe("Algo salió mal. Inténtalo de nuevo.");
  });
});

describe("friendlyError — fallback paths", () => {
  it("falls back for non-Error, non-string input", () => {
    expect(friendlyError(null)).toBe(FALLBACK);
    expect(friendlyError(42)).toBe(FALLBACK);
    expect(friendlyError({ nope: true })).toBe(FALLBACK);
  });

  it("falls back for an empty string", () => {
    expect(friendlyError("")).toBe(FALLBACK);
  });

  it("honors a custom fallback", () => {
    expect(friendlyError(null, "Custom fallback")).toBe("Custom fallback");
  });

  it("suppresses raw backend plumbing", () => {
    expect(friendlyError(new Error("[CONVEX A(auth:signIn)] [Request ID: abc] Server Error"))).toBe(
      FALLBACK,
    );
  });
});

describe("friendlyError — core extraction", () => {
  it("passes through a plain unmatched message", () => {
    expect(friendlyError(new Error("Disk is full"))).toBe("Disk is full");
  });

  it("extracts the message after 'Uncaught Error:' and drops the stack trace", () => {
    expect(friendlyError(new Error("Uncaught Error: Boom happened at handler (file.ts:1)"))).toBe(
      "Boom happened",
    );
  });

  it("accepts a raw string error", () => {
    expect(friendlyError("Disk is full")).toBe("Disk is full");
  });

  it("truncates an over-long core to 137 chars plus an ellipsis", () => {
    const long = "x".repeat(150);
    const result = friendlyError(new Error(long));
    expect(result).toBe(`${"x".repeat(137)}…`);
    expect(result).toHaveLength(138);
  });
});

describe("reportError", () => {
  beforeEach(() => {
    vi.mocked(captureError).mockClear();
  });

  it("returns the same user-facing message as friendlyError", () => {
    expect(reportError(new Error("Failed to fetch"))).toBe(
      "Network error. Check your connection and try again.",
    );
  });

  it("captures the error to telemetry by default, with context", () => {
    const err = new Error("Boom");
    reportError(err, { context: { where: "unit-test" } });
    expect(captureError).toHaveBeenCalledTimes(1);
    expect(captureError).toHaveBeenCalledWith(err, { where: "unit-test" });
  });

  it("skips telemetry when capture is false", () => {
    reportError(new Error("expected, benign"), { capture: false });
    expect(captureError).not.toHaveBeenCalled();
  });

  it("honors a custom fallback", () => {
    expect(reportError(null, { fallback: "Nope.", capture: false })).toBe("Nope.");
  });

  it("accepts a bare string as the fallback (drop-in for friendlyError)", () => {
    const err = new Error("Boom");
    expect(reportError(err, "Fallback msg")).toBe("Boom");
    expect(captureError).toHaveBeenCalledWith(err, undefined);
  });
});
