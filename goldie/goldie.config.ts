import { fileURLToPath } from "node:url";
import type { GoldieConfig } from "goldie";

const appRoot = fileURLToPath(new URL("..", import.meta.url));
const requestedLocale = process.env.LOOPER_GOLDIE_LOCALE;
const locales =
  requestedLocale === "en-US" || requestedLocale === "es-ES"
    ? [requestedLocale]
    : ["en-US", "es-ES"];

const config: GoldieConfig = {
  appRoot,
  appPath: `${appRoot}/goldie/build/Looper.app`,
  appearance: "light",
  bundleId: "com.j11.looper.mobile",
  devices: ["iphone-6.9"],
  frame: { variant: "17-pro-silver" },
  locales,
  scenes: [
    {
      flow: "store-01-home",
      headline: {
        "en-US": "Everything starts with your voice",
        "es-ES": "Todo empieza con tu voz",
      },
      id: "home",
      kind: "screenshot",
      layout: "hero",
      subhead: {
        "en-US": "Dictation, notes, and meetings in one place.",
        "es-ES": "Dictados, notas y reuniones en un solo lugar.",
      },
    },
    {
      flow: "store-02-meeting",
      headline: { "en-US": "Remember what matters", "es-ES": "Recuerda lo importante" },
      id: "meeting",
      kind: "screenshot",
      layout: "tilt-right",
      subhead: {
        "en-US": "Summary, decisions, and tasks with the evidence close at hand.",
        "es-ES": "Resumen, decisiones y tareas con la evidencia a mano.",
      },
    },
    {
      flow: "store-03-library",
      headline: { "en-US": "Find any idea", "es-ES": "Encuentra cualquier idea" },
      id: "library",
      kind: "screenshot",
      layout: "classic",
      subhead: {
        "en-US": "Your voice memory, organized and searchable.",
        "es-ES": "Tu memoria de voz, ordenada y buscable.",
      },
    },
    {
      flow: "store-04-studio",
      headline: { "en-US": "Your voice, your way", "es-ES": "Tu voz, a tu manera" },
      id: "studio",
      kind: "screenshot",
      layout: "offset",
      subhead: {
        "en-US": "Set the tone and let Looper clean up the rest.",
        "es-ES": "Ajusta el tono y deja que Looper limpie el resto.",
      },
    },
    {
      flow: "store-05-capture",
      headline: { "en-US": "Choose the outcome", "es-ES": "Elige el resultado" },
      id: "capture",
      kind: "screenshot",
      layout: "minimal",
    },
  ],
  store: {
    ageRating: "4+",
    category: "Productivity",
    description: {
      "en-US":
        "Looper turns your voice into useful memory. Dictate ideas, record meetings, and return to every decision with its context.\n\nLocal audio and transcripts remain under your control.",
      "es-ES":
        "Looper convierte tu voz en memoria útil. Dicta ideas, registra reuniones y vuelve a cada decisión con su contexto.\n\nEl audio y la transcripción local permanecen bajo tu control.",
    },
    developer: "J11",
    name: "Looper",
    price: "Free",
    rating: 4.8,
    ratingCount: "1.2K ratings",
    subtitle: { "en-US": "Your voice, ready to use", "es-ES": "Tu voz, lista para usar" },
  },
  theme: {
    background: "linear-gradient(160deg, #F1ECFF 0%, #FAF8F3 58%, #FFFFFF 100%)",
    copyHeightRatio: 0.23,
    deviceWidthRatio: 0.84,
    fontFamily: '-apple-system, "SF Pro Display", system-ui, sans-serif',
    headlineColor: "#15161A",
    layout: "classic",
    subheadColor: "#626675",
  },
};

export default config;
