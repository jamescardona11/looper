import { setupI18n, type Messages } from "@lingui/core";
import { describe, expect, it } from "vitest";

import { createLocaleController } from "./i18n";

const enMessages: Messages = { greeting: "English" };
const esMessages: Messages = { greeting: "Español" };

function createController(systemLocale?: string) {
  const runtime = setupI18n();
  const documentElement = { lang: "" };
  const controller = createLocaleController({
    runtime,
    supportedLocales: ["en", "es"],
    defaultLocale: "en",
    catalogModules: {
      "./locales/en/messages.js": { messages: enMessages },
      "./locales/es/messages.js": { default: { messages: esMessages } },
      "./outside/messages.js": { messages: { greeting: "Ignored" } },
    },
    getSystemLocale: () => systemLocale,
    document: { documentElement },
  });

  return { controller, documentElement, runtime };
}

describe("i18n", () => {
  it("registra sólo módulos bajo la topología de locales", () => {
    const { controller, runtime } = createController();

    controller.activateLocale("en");

    expect(runtime._({ id: "greeting" })).toBe("English");
  });

  it("falla temprano cuando falta el catálogo de un locale de producto", () => {
    expect(() =>
      createLocaleController({
        runtime: setupI18n(),
        supportedLocales: ["en", "es"],
        defaultLocale: "en",
        catalogModules: {
          "./locales/en/messages.js": { messages: enMessages },
        },
      }),
    ).toThrow("Missing locale catalog for es");
  });

  it("prioriza una preferencia explícita frente al locale del sistema", () => {
    const { controller, runtime } = createController("es-MX");

    expect(controller.activateLocale("en")).toBe("en");
    expect(runtime._({ id: "greeting" })).toBe("English");
  });

  it("normaliza alias y región, con fallback determinista durante SSR", () => {
    const { controller } = createController();

    expect(controller.activateLocale("es_MX")).toBe("es");
    expect(controller.activateLocale("system")).toBe("en");
  });

  it("actualiza el documento y los mensajes al cambiar la configuración", () => {
    const { controller, documentElement, runtime } = createController();

    controller.activateLocale("en");
    controller.activateLocale("es-MX");

    expect(documentElement.lang).toBe("es");
    expect(runtime._({ id: "greeting" })).toBe("Español");
  });
});
