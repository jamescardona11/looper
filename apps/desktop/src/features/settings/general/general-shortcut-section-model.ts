import type { GeneralShortcutProps } from "./GeneralTab.types";
import type { ShortcutMode } from "../shortcuts/ShortcutRow";

type ShortcutLabels = Record<
  ShortcutMode,
  Readonly<{ label: string; description: string }>
>;

export type ShortcutModeItem = Readonly<{
  mode: ShortcutMode;
  label: string;
  description: string;
  enabled: boolean;
  canDisable: boolean;
  setEnabled: (enabled: boolean) => void;
}>;

export function shortcutModeItems(
  props: GeneralShortcutProps,
  labels: ShortcutLabels,
): ShortcutModeItem[] {
  const enabled = {
    smart: props.smartEnabled,
    hold: props.holdEnabled,
    toggle: props.toggleEnabled,
  };
  const setters = {
    smart: props.setSmartEnabled,
    hold: props.setHoldEnabled,
    toggle: props.setToggleEnabled,
  };

  return (["smart", "hold", "toggle"] as const).map((mode) => ({
    mode,
    ...labels[mode],
    enabled: enabled[mode],
    canDisable: Object.entries(enabled).some(
      ([candidate, active]) => candidate !== mode && active,
    ),
    setEnabled: setters[mode],
  }));
}
