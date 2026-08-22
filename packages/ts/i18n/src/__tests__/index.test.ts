import { describe, expect, it } from "vitest";
import { activateLocale, detectLocale, i18n, SUPPORTED_LOCALES } from "../index";
import { en } from "../locales/en";
import { es } from "../locales/es";

describe("i18n with Lingui", () => {
  it("activates English locale", () => {
    activateLocale("en");
    expect(i18n.locale).toBe("en");
    expect(i18n.t("auth.signIn")).toBe("Sign in");
    expect(i18n.t("common.loading")).toBe("Loading…");
  });

  it("activates Spanish locale", () => {
    activateLocale("es");
    expect(i18n.locale).toBe("es");
    expect(i18n.t("auth.signIn")).toBe("Iniciar sesión");
    expect(i18n.t("common.loading")).toBe("Cargando…");
  });

  it("returns message id for unknown keys", () => {
    activateLocale("en");
    expect(i18n.t("nonexistent.key")).toBe("nonexistent.key");
  });

  it("supports interpolation with Lingui syntax", () => {
    activateLocale("en");
    expect(i18n.t({ id: "home.greeting", values: { name: "Ada" } })).toContain("Ada");
  });

  it("interpolates positional named params (the form i18n/react.tsx uses)", () => {
    activateLocale("en");
    // react.tsx's translate calls i18n.t(id, values) positionally. Pin that this
    // interpolates: a release build once rendered raw "{remaining} of {limit} …
    // {tier}" placeholders, and a Lingui major-version skew is the suspected
    // cause — a regression here surfaces as unsubstituted placeholders in the UI.
    expect(i18n.t("agent.messagesLeftToday", { remaining: 9, limit: 10, tier: "FREE" })).toBe(
      "9 of 10 messages left today · FREE",
    );
    activateLocale("es");
    expect(i18n.t("agent.messagesLeftToday", { remaining: 9, limit: 10, tier: "FREE" })).toBe(
      "9 de 10 mensajes restantes hoy · FREE",
    );
  });

  it("supports expected locales", () => {
    expect(SUPPORTED_LOCALES).toContain("en");
    expect(SUPPORTED_LOCALES).toContain("es");
  });

  it("detectLocale returns a valid locale", () => {
    const locale = detectLocale();
    expect(SUPPORTED_LOCALES).toContain(locale);
  });

  it("switches between locales", () => {
    activateLocale("en");
    expect(i18n.t("auth.signOut")).toBe("Sign out");
    activateLocale("es");
    expect(i18n.t("auth.signOut")).toBe("Cerrar sesión");
  });

  // Parity is also enforced at compile time (es is typed Record<keyof typeof en,
  // string>); this is the runtime backstop so a weakened type can't let drift
  // through silently.
  it("has identical keys in every locale (en/es parity)", () => {
    const enKeys = Object.keys(en).sort();
    const esKeys = Object.keys(es).sort();
    const missingInEs = enKeys.filter((k) => !(k in es));
    const missingInEn = esKeys.filter((k) => !(k in en));
    expect(missingInEs, `keys missing in es: ${missingInEs.join(", ")}`).toEqual([]);
    expect(missingInEn, `keys missing in en: ${missingInEn.join(", ")}`).toEqual([]);
    expect(esKeys).toEqual(enKeys);
  });

  it("has no empty translation values", () => {
    for (const [key, value] of Object.entries(es)) {
      expect(value.length, `empty es value for ${key}`).toBeGreaterThan(0);
    }
    for (const [key, value] of Object.entries(en)) {
      expect(value.length, `empty en value for ${key}`).toBeGreaterThan(0);
    }
  });
});
