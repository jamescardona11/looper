export type ShortcutBinding = {
  shortcut: string;
  temporary: boolean;
  cleanup_enabled: boolean;
};

export type ShortcutBindings = {
  smart: ShortcutBinding[];
  hold: ShortcutBinding[];
  toggle: ShortcutBinding[];
};
