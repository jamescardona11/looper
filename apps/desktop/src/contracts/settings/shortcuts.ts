type ShortcutBehavior = Record<"temporary" | "cleanup_enabled", boolean>;

export type ShortcutBinding = ShortcutBehavior & {
  shortcut: string;
};

type ShortcutMode = "smart" | "hold" | "toggle";

export type ShortcutBindings = Record<ShortcutMode, ShortcutBinding[]>;
