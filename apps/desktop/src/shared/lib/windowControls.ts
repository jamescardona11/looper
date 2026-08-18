import { getCurrentWindow } from "@tauri-apps/api/window";

export type WindowAction = "minimize" | "maximize" | "close";

export function performWindowAction(action: WindowAction): Promise<void> {
  const appWindow = getCurrentWindow();

  switch (action) {
    case "minimize":
      return appWindow.minimize();
    case "maximize":
      return appWindow.toggleMaximize();
    case "close":
      return appWindow.close();
  }
}
