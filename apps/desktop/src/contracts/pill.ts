import { msg } from "@lingui/core/macro";
import type { MessageDescriptor } from "@lingui/core";

export type PillStatus =
  "idle" | "preflight" | "listening" | "processing" | "cancelled" | "error";
// "action_select" and "ask_result" support Selection Mode; see
// PillOverlay.tsx and selection_actions.rs.
export type PillTone =
  | "default"
  | "cleanup"
  | "preview"
  | "action_select"
  | "ask_result"
  | "copy_result"
  | "inserted_result";

export type PillStatePayload = {
  status: PillStatus;
};

export type AudioSpectrumPayload = {
  bins: number[];
};

export type PillModePayload = {
  expanded: boolean;
  text?: string;
  tone?: PillTone;
  // Page context opt-in (F5.3): true when the shown text came from a
  // Selection Mode transform that used captured screen context.
  usedScreenContext?: boolean;
};

export type PillHoverPayload = {
  hovering: boolean;
};

// Streaming preview of a Selection Mode transform (pill:transform-stream):
// `text` is the transform output accumulated so far. Display-only - the
// final, insertable text always arrives via `pill:mode` (tone "preview").
export type PillTransformStreamPayload = {
  text: string;
};

// Selection Mode (F2): mirrors `selection_actions::EditAction` /
// `TransformPreset` in the Rust backend (serde `rename_all = "snake_case"`).
export type EditAction = "replace" | "insert" | "ask" | "copy";

export type TransformPreset =
  "polish" | "literal" | "chat" | "email" | "prompt_better";

// Smart Modes (F5) - mirrors `mode_rules::ModeRuleSuggestion` (serde
// `rename_all = "camelCase"`, unlike `ModeRule` itself).
export type ModeRuleSuggestion = {
  transformPreset: TransformPreset | null;
  autoSendOnInsert: boolean;
};

export const EDIT_ACTIONS: {
  action: EditAction;
  label: MessageDescriptor;
  key: string;
}[] = [
  {
    action: "replace",
    label: msg({
      id: "pill.selection_mode.action.replace",
      message: "Replace",
    }),
    key: "1",
  },
  {
    action: "insert",
    label: msg({ id: "pill.selection_mode.action.insert", message: "Insert" }),
    key: "2",
  },
  {
    action: "ask",
    label: msg({ id: "pill.selection_mode.action.ask", message: "Ask" }),
    key: "3",
  },
  {
    action: "copy",
    label: msg({ id: "pill.selection_mode.action.copy", message: "Copy" }),
    key: "4",
  },
];

export const TRANSFORM_PRESETS: {
  preset: TransformPreset;
  label: MessageDescriptor;
}[] = [
  {
    preset: "polish",
    label: msg({ id: "pill.selection_mode.preset.polish", message: "Polish" }),
  },
  {
    preset: "literal",
    label: msg({
      id: "pill.selection_mode.preset.literal",
      message: "Literal",
    }),
  },
  {
    preset: "chat",
    label: msg({ id: "pill.selection_mode.preset.chat", message: "Chat" }),
  },
  {
    preset: "email",
    label: msg({ id: "pill.selection_mode.preset.email", message: "Email" }),
  },
  {
    preset: "prompt_better",
    label: msg({
      id: "pill.selection_mode.preset.prompt_better",
      message: "Prompt Better",
    }),
  },
];
