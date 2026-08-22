import { formatShortcutForDisplay } from "../../../shared/lib/shortcuts";
import type { ShortcutBinding } from "../../../contracts/index";

export type ShortcutMode = "smart" | "hold" | "toggle";
export type CaptureMode = { mode: ShortcutMode; index: number } | null;
export type InvalidShortcutDrafts = Partial<
  Record<ShortcutMode, Record<number, string>>
>;

export type ShortcutBindingItem = {
  binding: ShortcutBinding;
  index: number;
  display: string;
  capturing: boolean;
  error: string | null;
};

const MAX_BINDINGS = 3;
const EMPTY_BINDING: ShortcutBinding = {
  shortcut: "",
  temporary: false,
  cleanup_enabled: false,
};

export function shortcutBindingView(args: {
  mode: ShortcutMode;
  bindings: ShortcutBinding[];
  invalidDrafts?: Record<number, string>;
  activeCapture: CaptureMode;
  emptyLabel: string;
}) {
  const bindings = args.bindings.length > 0 ? args.bindings : [EMPTY_BINDING];
  const items = bindings.map((binding, index): ShortcutBindingItem => ({
    binding,
    index,
    display: binding.shortcut
      ? formatShortcutForDisplay(binding.shortcut)
      : args.emptyLabel,
    capturing:
      args.activeCapture?.mode === args.mode &&
      args.activeCapture.index === index,
    error: args.invalidDrafts?.[index] ?? null,
  }));

  return {
    primary: items[0],
    alternatives: items.slice(1),
    alternativeCount: items.length - 1,
    canAdd: items.length < MAX_BINDINGS,
  };
}
