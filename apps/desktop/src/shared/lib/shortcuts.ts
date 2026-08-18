import { detectAppPlatform } from "../../platform/service";

type Platform = ReturnType<typeof detectAppPlatform>;

type Modifier = "Fn" | "Cmd" | "Opt" | "Ctrl" | "Shift";

type ShortcutPart = {
  display: string;
  modifier?: Modifier;
};

const MODIFIER_ORDER: Modifier[] = ["Fn", "Cmd", "Opt", "Ctrl", "Shift"];

const MODIFIER_ALIASES: Record<string, Modifier> = {
  fn: "Fn",
  command: "Cmd",
  cmd: "Cmd",
  meta: "Cmd",
  super: "Cmd",
  win: "Cmd",
  windows: "Cmd",
  control: "Ctrl",
  ctrl: "Ctrl",
  alt: "Opt",
  option: "Opt",
  opt: "Opt",
  altgr: "Opt",
  shift: "Shift",
};

const KEY_ALIASES: Record<string, string> = {
  arrowleft: "Left",
  arrowright: "Right",
  arrowup: "Up",
  arrowdown: "Down",
  spacebar: "Space",
  space: "Space",
  mousemiddle: "Middle Click",
  middleclick: "Middle Click",
  mouse3: "Middle Click",
  mb3: "Middle Click",
  mouseback: "Mouse Back",
  mouse4: "Mouse Back",
  mb4: "Mouse Back",
  xbutton1: "Mouse Back",
  mouseforward: "Mouse Forward",
  mouse5: "Mouse Forward",
  mb5: "Mouse Forward",
  xbutton2: "Mouse Forward",
};

export function formatShortcutForDisplay(shortcut: string): string {
  const platform = detectAppPlatform();
  const parts = shortcut
    .split("+")
    .map((token) => describeToken(token, platform))
    .filter((part): part is ShortcutPart => part !== null);

  return parts
    .sort((left, right) => modifierPosition(left) - modifierPosition(right))
    .map(({ display }) => display)
    .join(" + ");
}

function describeToken(token: string, platform: Platform): ShortcutPart | null {
  const trimmed = token.trim();
  if (!trimmed) return null;

  const normalized = trimmed.toLocaleLowerCase();
  if (isPortableCommand(normalized)) {
    return modifierPart(platform === "macos" ? "Cmd" : "Ctrl", platform);
  }

  const sidedModifier = parseSidedModifier(normalized);
  if (sidedModifier) {
    return {
      modifier: sidedModifier.modifier,
      display: `${sidedModifier.side} ${modifierName(sidedModifier.modifier, platform)}`,
    };
  }

  const modifier = MODIFIER_ALIASES[normalized];
  if (modifier) return modifierPart(modifier, platform);

  return { display: keyName(trimmed, normalized, platform) };
}

function isPortableCommand(token: string): boolean {
  return [
    "commandorcontrol",
    "commandorctrl",
    "cmdorctrl",
    "cmdorcontrol",
  ].includes(token);
}

function parseSidedModifier(
  token: string,
): { modifier: Modifier; side: "Left" | "Right" } | null {
  const prefix = token.match(/^(left|right)(.+)$/);
  const suffix = token.match(/^(.+)(left|right)$/);
  const match = prefix ?? suffix;
  if (!match) return null;

  const sideToken = prefix ? match[1] : match[2];
  const modifierToken = prefix ? match[2] : match[1];
  const modifier = MODIFIER_ALIASES[modifierToken];
  if (!modifier) return null;

  return {
    modifier,
    side: sideToken === "left" ? "Left" : "Right",
  };
}

function modifierPart(modifier: Modifier, platform: Platform): ShortcutPart {
  return { modifier, display: modifierName(modifier, platform) };
}

function modifierName(modifier: Modifier, platform: Platform): string {
  if (modifier === "Cmd") return platform === "macos" ? "Command" : "Meta";
  if (modifier === "Opt") return platform === "macos" ? "Option" : "Alt";
  return modifier;
}

function modifierPosition(part: ShortcutPart): number {
  return part.modifier
    ? MODIFIER_ORDER.indexOf(part.modifier)
    : MODIFIER_ORDER.length;
}

function keyName(token: string, normalized: string, platform: Platform): string {
  if (normalized === "delete") {
    return platform === "macos" ? "Delete" : "Delete";
  }
  if (token === "ForwardDelete") {
    return platform === "macos" ? "Forward Delete" : "Delete";
  }
  if (token === "Return") return "Enter";
  if (token === "Escape") return "Esc";
  if (token.startsWith("Keypad")) return token.replace(/^Keypad/, "Keypad ");

  return KEY_ALIASES[normalized] ?? token.replace(/([a-z0-9])([A-Z])/g, "$1 $2");
}
