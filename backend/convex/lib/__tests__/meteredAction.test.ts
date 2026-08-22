import { describe, expect, it } from "vitest";
import { selectApiKey } from "../meteredAction";

// Pins the BYOK-extension rule introduced when key resolution was centralized in
// beginMeteredAction: a user's own key is used for the real provider call in the
// metered features (not just the chat agent), but ONLY for BYOK-capable providers
// and only when a key actually resolved. Everything else uses the server key.
describe("selectApiKey (BYOK-extension rule)", () => {
  const SERVER = "sk-server";
  const USER = "sk-user";

  it("uses the user's key for a BYOK-capable provider when byok and a key resolved", () => {
    for (const provider of ["openai", "anthropic", "google"]) {
      expect(selectApiKey({ byok: true, provider, serverApiKey: SERVER, userKey: USER })).toBe(
        USER,
      );
    }
  });

  it("uses the server key for a non-BYOK provider even when byok is true", () => {
    for (const provider of ["deepgram", "assemblyai", "elevenlabs", "replicate"]) {
      expect(selectApiKey({ byok: true, provider, serverApiKey: SERVER, userKey: USER })).toBe(
        SERVER,
      );
    }
  });

  it("uses the server key when the caller is not byok", () => {
    expect(
      selectApiKey({ byok: false, provider: "openai", serverApiKey: SERVER, userKey: USER }),
    ).toBe(SERVER);
  });

  it("falls back to the server key when the BYOK key did not resolve", () => {
    expect(
      selectApiKey({ byok: true, provider: "openai", serverApiKey: SERVER, userKey: null }),
    ).toBe(SERVER);
    expect(
      selectApiKey({ byok: true, provider: "openai", serverApiKey: SERVER, userKey: undefined }),
    ).toBe(SERVER);
  });

  it("returns undefined when neither a user key nor a server key exists", () => {
    expect(
      selectApiKey({ byok: false, provider: "deepgram", serverApiKey: undefined, userKey: null }),
    ).toBeUndefined();
  });
});
