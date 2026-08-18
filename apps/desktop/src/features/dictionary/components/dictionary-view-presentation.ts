import type { CSSProperties } from "react";

import { voiceListAnatomy } from "../../voice/components/voice-list-anatomy";

const classes = (...tokens: string[]) => tokens.join(" ");

export const DICTIONARY_PANEL_BODY = classes(
  "mt-4 min-h-[16rem] max-h-[calc(100vh-330px)]",
  "overflow-x-hidden overflow-y-auto custom-scrollbar",
);
export const DICTIONARY_PANEL_FADE = "pb-20";
export const DICTIONARY_EDIT_ROW = classes(
  "group relative flex min-h-[42px] items-center rounded-lg",
  "bg-[var(--surface-interactive)]",
);
export const DICTIONARY_DELETE_BUTTON = classes(
  "rounded p-1 text-content-muted transition-colors",
  "hover:bg-[color-mix(in_srgb,var(--color-error)_16%,transparent)] hover:text-error",
);
export const DICTIONARY_DELETE_BUTTON_ACTIVE = classes(
  "rounded p-1 text-error",
  "bg-[color-mix(in_srgb,var(--color-error)_16%,transparent)] transition-colors",
);
export const DICTIONARY_FADE_ITEM_THRESHOLD = 6;
export const DICTIONARY_ACTION_GRADIENT: CSSProperties = {
  backgroundImage:
    "linear-gradient(to left, " +
    "var(--color-row-action-fade) 62%, transparent)",
};

export function dictionaryItemRowClass(embedded: boolean): string {
  return embedded
    ? `${voiceListAnatomy.row} overflow-hidden`
    : "group relative flex min-h-[42px] items-center overflow-hidden rounded-lg transition-colors hover:bg-[var(--surface-interactive)]";
}
