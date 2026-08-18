import { createContext, useContext, useState, type ReactNode } from "react";
import { subscribeThemeChanged } from "../../../data/settings";
import { useMountEffect } from "../../../shared/hooks/useMountEffect";

export type MemberCardPalette = {
  bg: string;
  textPrimary: string;
  textDisabled: string;
  border: string;
  dotColor: string;
  stripeBg: string;
  shellShadow: string;
  noiseOpacity: number;
  securityDotOpacity: number;
  vignette: string;
  wordmarkShadow: string;
};

const palette = (
  mode: "light" | "dark",
  noiseOpacity: number,
  securityDotOpacity: number,
): MemberCardPalette => ({
  bg: `var(--member-card-${mode}-bg)`,
  textPrimary: `var(--member-card-${mode}-text)`,
  textDisabled: `var(--member-card-${mode}-muted)`,
  border: `var(--member-card-${mode}-border)`,
  dotColor: `var(--member-card-${mode}-dot)`,
  stripeBg: `var(--member-card-${mode}-stripe)`,
  shellShadow: `var(--member-card-${mode}-shadow)`,
  noiseOpacity,
  securityDotOpacity,
  vignette: `var(--member-card-${mode}-vignette)`,
  wordmarkShadow: `var(--member-card-${mode}-wordmark-shadow)`,
});

export const MEMBER_CARD_LIGHT_PALETTE = palette("light", 0.045, 0.14);
export const MEMBER_CARD_DARK_PALETTE = palette("dark", 0.05, 0.1);

const themePalette = (): MemberCardPalette =>
  document.documentElement.dataset.theme === "light"
    ? MEMBER_CARD_LIGHT_PALETTE
    : MEMBER_CARD_DARK_PALETTE;

const MemberCardPaletteContext = createContext(MEMBER_CARD_LIGHT_PALETTE);

export const useMemberCardPalette = () => useContext(MemberCardPaletteContext);

export const MemberCardPaletteProvider = ({
  children,
}: {
  children: ReactNode;
}) => {
  const [currentPalette, setCurrentPalette] = useState(themePalette);

  useMountEffect(() => {
    const refresh = () => setCurrentPalette(themePalette());
    let disposed = false;
    let stopNativeSubscription: (() => void) | null = null;
    const themeAttribute = new MutationObserver(refresh);
    themeAttribute.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["data-theme"],
    });
    const systemTheme = window.matchMedia("(prefers-color-scheme: light)");
    systemTheme.addEventListener("change", refresh);
    void subscribeThemeChanged(refresh)
      .then((stop) => {
        if (disposed) stop();
        else stopNativeSubscription = stop;
      })
      .catch(() => undefined);

    return () => {
      disposed = true;
      themeAttribute.disconnect();
      systemTheme.removeEventListener("change", refresh);
      stopNativeSubscription?.();
      stopNativeSubscription = null;
    };
  });

  return (
    <MemberCardPaletteContext.Provider value={currentPalette}>
      {children}
    </MemberCardPaletteContext.Provider>
  );
};
