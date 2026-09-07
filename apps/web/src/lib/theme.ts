// The Web product currently has a single visual mode. Keeping this hook gives
// shared consumers (including the toaster) one stable, truthful source while
// preventing a saved preference or the operating system from changing the UI.

import { useEffect } from "react";

export type Theme = "light";

function applyLightTheme() {
  if (typeof document === "undefined") return;
  const el = document.documentElement;
  el.classList.remove("dark");
  el.classList.add("light");
}

function persistLightTheme() {
  try {
    localStorage.setItem("looper-theme", "light");
  } catch {
    // Storage is optional; the document still stays light.
  }
  applyLightTheme();
}

export function useTheme() {
  useEffect(() => {
    persistLightTheme();
  }, []);
  return { theme: "light" as const };
}
