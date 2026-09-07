import { type Locale, resolveInitialLocale, SUPPORTED_LOCALES } from "@looper/i18n";
import { I18nProvider } from "@looper/i18n/react";
import React from "react";
import ReactDOM from "react-dom/client";
import { App } from "./app";
import "./styles/index.css";

const rootElement = document.getElementById("root")!;

function initialLocale(): Locale {
  const requested = new URLSearchParams(window.location.search).get("lang");
  return SUPPORTED_LOCALES.includes(requested as Locale)
    ? (requested as Locale)
    : resolveInitialLocale();
}

const landingLocale = initialLocale();
document.documentElement.lang = landingLocale;

// HMR guard: avoid creating a second React root over an existing one when Vite
// hot-reloads this module. The prerenderer strips `data-mounted` from the
// static HTML (see postProcess in vite.config.ts) so hydration starts clean.
if (rootElement.dataset.mounted !== "true") {
  rootElement.dataset.mounted = "true";
  ReactDOM.createRoot(rootElement).render(
    <React.StrictMode>
      <I18nProvider defaultLocale={landingLocale}>
        <App />
      </I18nProvider>
    </React.StrictMode>,
  );
}
