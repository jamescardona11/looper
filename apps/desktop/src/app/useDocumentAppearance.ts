import { getCurrentWindow } from "@tauri-apps/api/window";
import { useEffect } from "react";

import {
  subscribeTextSizeChanged,
  subscribeThemeChanged,
} from "../data/settings";
import { detectAppPlatform } from "../platform/service";
import {
  parseTextSizeMode,
  resolveTextScale,
  TEXT_SIZE_MODE_STORAGE_KEY,
} from "../shared/lib/textSize";
import type { ThemeMode } from "../types";
import { parseThemePreference, themeForDocument } from "./document-theme";

type DocumentAppearanceOptions = {
  windowLabel: string;
  previewMode: boolean;
  previewTheme: "light" | "dark";
  settingsLoading: boolean;
  onboardingVisible: boolean;
  storedTheme: string | null | undefined;
};

/**
 * Tauri necesita un color ya resuelto para el fondo nativo de la ventana: no
 * puede leer una variable CSS. Se toma del token que el documento acaba de
 * aplicar, de forma que sigue a la paleta en vez de duplicar sus valores.
 */
const SETTINGS_WINDOW_BACKGROUND_TOKEN = "--color-bg-secondary";

export function useDocumentAppearance({
  windowLabel,
  previewMode,
  previewTheme,
  settingsLoading,
  onboardingVisible,
  storedTheme,
}: DocumentAppearanceOptions) {
  useContextMenuBlock();
  useTextScale(windowLabel, previewMode);
  useTheme({
    windowLabel,
    previewMode,
    previewTheme,
    settingsLoading,
    onboardingVisible,
    storedTheme,
  });
  useSettingsBackground(windowLabel);
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
  previewTheme,
  settingsLoading,
  onboardingVisible,
  storedTheme,
}: DocumentAppearanceOptions) {
  useEffect(() => {
    const root = document.documentElement;
    const nativeWindow = windowLabel === "settings" ? getCurrentWindow() : null;
    const applyNativeBackground = () => {
      if (!nativeWindow) return;
      // Se llama siempre después de fijar root.dataset.theme, así que el valor
      // computado ya corresponde al modo activo.
      const background = getComputedStyle(root)
        .getPropertyValue(SETTINGS_WINDOW_BACKGROUND_TOKEN)
        .trim();
      if (!background) return;
      void nativeWindow.setBackgroundColor(background).catch(() => undefined);
    };
    if (previewMode) {
      root.dataset.theme = previewTheme;
      applyNativeBackground();
      return;
    }
    if (windowLabel !== "settings" || settingsLoading) {
      root.dataset.theme = "dark";
      return;
    }

    const mediaQuery = window.matchMedia("(prefers-color-scheme: light)");
    let selected: ThemeMode = onboardingVisible
      ? "system"
      : parseThemePreference(storedTheme ?? null);
    const apply = (mode: ThemeMode) => {
      selected = mode;
      const theme = themeForDocument(mode, mediaQuery.matches);
      root.dataset.theme = theme;
      applyNativeBackground();
    };
    const followSystem = () => {
      if (selected === "system") apply("system");
    };

    apply(selected);
    mediaQuery.addEventListener("change", followSystem);
    const pendingStop = subscribeThemeChanged((mode) =>
      apply(parseThemePreference(mode ?? null)),
    );

    return () => {
      mediaQuery.removeEventListener("change", followSystem);
      void pendingStop.then((stop) => stop()).catch(() => undefined);
    };
  }, [
    onboardingVisible,
    previewMode,
    previewTheme,
    settingsLoading,
    storedTheme,
    windowLabel,
  ]);
}

function useSettingsBackground(windowLabel: string) {
  useEffect(() => {
    const color = windowLabel === "settings" ? "var(--color-bg-secondary)" : "";
    document.documentElement.style.backgroundColor = color;
    document.body.style.backgroundColor = color;
    return () => {
      document.documentElement.style.backgroundColor = "";
      document.body.style.backgroundColor = "";
    };
  }, [windowLabel]);
}
