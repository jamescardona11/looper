import { useEffect } from "react";

import {
  subscribeTextSizeChanged,
} from "../data/settings";
import { detectAppPlatform } from "../platform/service";
import { setWindowBackgroundColor } from "../data/system/window";
import {
  parseTextSizeMode,
  resolveTextScale,
  TEXT_SIZE_MODE_STORAGE_KEY,
} from "../shared/lib/textSize";

type DocumentAppearanceOptions = {
  windowLabel: string;
  previewMode: boolean;
};

/**
 * Tauri necesita un color ya resuelto para el fondo nativo de la ventana: no
 * puede leer una variable CSS. Se toma del token que el documento acaba de
 * aplicar, de forma que sigue a la paleta en vez de duplicar sus valores.
 */
const SETTINGS_WINDOW_BACKGROUND_TOKEN = "--desktop-canvas";

export function useDocumentAppearance({
  windowLabel,
  previewMode,
}: DocumentAppearanceOptions) {
  useContextMenuBlock();
  useWindowSurface(windowLabel);
  useTextScale(windowLabel, previewMode);
  useTheme({
    windowLabel,
    previewMode,
  });
  useSettingsBackground(windowLabel);
}

function useWindowSurface(windowLabel: string) {
  useEffect(() => {
    const root = document.documentElement;
    // `main` es el panel flotante de Dictation, no el workspace. Settings
    // necesita el canvas cálido para que el fondo nativo coincida con la
    // lámina paper; no se reserva un margen exterior adicional.
    if (windowLabel === "settings") {
      root.dataset.windowSurface = "workspace";
      return () => {
        delete root.dataset.windowSurface;
      };
    }

    // Las ventanas auxiliares (pill/main, toast y meeting awareness) son
    // transparentes. Nunca deben heredar el canvas del workspace.
    delete root.dataset.windowSurface;
  }, [windowLabel]);
}

function useContextMenuBlock() {
  useEffect(() => {
    const preventMenu = (event: MouseEvent) => event.preventDefault();
    document.addEventListener("contextmenu", preventMenu);
    return () => document.removeEventListener("contextmenu", preventMenu);
  }, []);
}

function useTextScale(windowLabel: string, previewMode: boolean) {
  useEffect(() => {
    if (previewMode) return;
    const root = document.documentElement;
    if (windowLabel !== "settings") {
      root.classList.remove("text-scale-anim-ready");
      root.style.setProperty("--ui-text-scale", "1");
      return;
    }

    const platform = detectAppPlatform();
    const apply = (mode: string | null) => {
      root.style.setProperty(
        "--ui-text-scale",
        resolveTextScale(parseTextSizeMode(mode), platform),
      );
    };
    apply(localStorage.getItem(TEXT_SIZE_MODE_STORAGE_KEY));
    root.classList.add("text-scale-anim-ready");
    const pendingStop = subscribeTextSizeChanged((mode) => apply(mode ?? null));

    return () => {
      root.classList.remove("text-scale-anim-ready");
      void pendingStop.then((stop) => stop()).catch(() => undefined);
    };
  }, [previewMode, windowLabel]);
}

function useTheme({
  windowLabel,
  previewMode,
}: DocumentAppearanceOptions) {
  useEffect(() => {
    const root = document.documentElement;
    const applyNativeBackground = () => {
      if (windowLabel !== "settings") return;
      // Se llama siempre después de fijar root.dataset.theme, así que el valor
      // computado ya corresponde al modo activo.
      const background = getComputedStyle(root)
        .getPropertyValue(SETTINGS_WINDOW_BACKGROUND_TOKEN)
        .trim();
      if (!background) return;
      void setWindowBackgroundColor(background).catch(() => undefined);
    };
    if (previewMode) {
      root.dataset.theme = "light";
      return;
    }
    // Todo el renderer de escritorio comparte la misma superficie clara.
    // Ni la preferencia persistida, ni el sistema, ni una ventana auxiliar
    // pueden reactivar una variante oscura.
    root.dataset.theme = "light";
    if (windowLabel === "settings") applyNativeBackground();
  }, [
    previewMode,
    windowLabel,
  ]);
}

function useSettingsBackground(windowLabel: string) {
  useEffect(() => {
    const color = windowLabel === "settings" ? "var(--desktop-canvas)" : "";
    document.documentElement.style.backgroundColor = color;
    document.body.style.backgroundColor = color;
    return () => {
      document.documentElement.style.backgroundColor = "";
      document.body.style.backgroundColor = "";
    };
  }, [windowLabel]);
}
