import { getPlatformCapabilities } from "../../platform/service";
import type {
  ShortcutBinding,
  ShortcutBindings,
  StoredSettings,
} from "../../types";

export type ShortcutMode = "smart" | "hold" | "toggle";
export type ShortcutTarget = { mode: ShortcutMode; index: number };
export type ShortcutCaptureTarget = ShortcutTarget | null;
export type ShortcutOverrides = Partial<
  Record<"smartShortcut" | "holdShortcut" | "toggleShortcut", string>
>;
export type InvalidShortcutDraft = {
  target: ShortcutTarget;
  message: string;
} | null;
export type InvalidShortcutDrafts = Partial<
  Record<ShortcutMode, Record<number, string>>
>;

type ShortcutSettingsSource = Pick<
  StoredSettings,
  | "shortcut_bindings"
  | "smart_shortcut"
  | "hold_shortcut"
  | "toggle_shortcut"
  | "cleanup_enabled"
>;

const LEGACY_SHORTCUTS: Record<Exclude<ShortcutMode, "smart">, string> = {
  hold: "Control+Shift+Space",
  toggle: "Control+Alt+Space",
};

export const resolveDefaultSmartShortcut = (platformId?: string) =>
  (platformId ?? getPlatformCapabilities().id) === "macos"
    ? "Fn"
    : "Control+Space";

export const createDefaultShortcutBindings = (
  platformId?: string,
): ShortcutBindings => ({
  smart: [createBinding(resolveDefaultSmartShortcut(platformId))],
  hold: [createBinding(LEGACY_SHORTCUTS.hold)],
  toggle: [createBinding(LEGACY_SHORTCUTS.toggle)],
});

export const restoreShortcutBindings = (
  settings: ShortcutSettingsSource,
): ShortcutBindings => ({
  smart: restoreModeBindings(settings, "smart", settings.smart_shortcut),
  hold: restoreModeBindings(settings, "hold", settings.hold_shortcut),
  toggle: restoreModeBindings(settings, "toggle", settings.toggle_shortcut),
});

export const removeShortcutCleanup = (
  bindings: ShortcutBindings,
): ShortcutBindings =>
  mapShortcutBindings(bindings, (binding) => ({
    ...binding,
    cleanup_enabled: false,
  }));

export const getPrimaryShortcut = (
  bindings: ShortcutBindings,
  mode: ShortcutMode,
  fallback: string,
) => bindings[mode][0]?.shortcut ?? fallback;

export const recoverInvalidShortcutDraft = (
  bindings: ShortcutBindings,
  invalidDraft: InvalidShortcutDraft,
  persistedBindings: ShortcutBindings,
): ShortcutBindings => {
  if (!invalidDraft) return bindings;

  const { mode, index } = invalidDraft.target;
  if (!bindings[mode][index]) return bindings;

  const persistedBinding = persistedBindings[mode][index];
  if (persistedBinding) {
    return replaceBinding(bindings, mode, index, persistedBinding);
  }

  if (index === 0) return bindings;

  return {
    ...bindings,
    [mode]: bindings[mode].filter(
      (_binding, bindingIndex) => bindingIndex !== index,
    ),
  };
};

export const indexInvalidShortcutDraft = (
  draft: InvalidShortcutDraft,
): InvalidShortcutDrafts =>
  draft
    ? {
        [draft.target.mode]: {
          [draft.target.index]: draft.message,
        },
      }
    : {};

function createBinding(shortcut: string): ShortcutBinding {
  return {
    shortcut,
    temporary: false,
    cleanup_enabled: false,
  };
}

function restoreModeBindings(
  settings: ShortcutSettingsSource,
  mode: ShortcutMode,
  legacyShortcut: string,
): ShortcutBinding[] {
  const currentBindings = settings.shortcut_bindings?.[mode];
  if (currentBindings?.length) return currentBindings;

  return [
    {
      ...createBinding(legacyShortcut),
      cleanup_enabled: settings.cleanup_enabled ?? false,
    },
  ];
}

function mapShortcutBindings(
  bindings: ShortcutBindings,
  transform: (binding: ShortcutBinding) => ShortcutBinding,
): ShortcutBindings {
  return {
    smart: bindings.smart.map(transform),
    hold: bindings.hold.map(transform),
    toggle: bindings.toggle.map(transform),
  };
}

function replaceBinding(
  bindings: ShortcutBindings,
  mode: ShortcutMode,
  index: number,
  persistedBinding: ShortcutBinding,
): ShortcutBindings {
  return {
    ...bindings,
    [mode]: bindings[mode].map((binding, bindingIndex) =>
      bindingIndex === index ? persistedBinding : binding,
    ),
  };
}
