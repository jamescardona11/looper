import { createContext, useContext } from "react";

type AppChromeContextValue = {
  setTabBarHidden: (hidden: boolean) => void;
};

export const AppChromeContext = createContext<AppChromeContextValue | null>(null);

export function useAppChrome() {
  const context = useContext(AppChromeContext);

  if (!context) {
    throw new Error("useAppChrome debe usarse dentro de AppChromeContext");
  }

  return context;
}
