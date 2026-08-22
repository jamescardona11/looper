import type { TransformPreset } from "../pill";

export type WorkflowField =
  "email" | "chat" | "document" | "prompt" | "code" | "form";

export type WorkflowInput = "dictation" | "selection" | "clipboard";
export type WorkflowEngine = "auto" | "local" | "cloud";
export type WorkflowOutput =
  { type: "insert" } | { type: "replace" } | { type: "copy" };

export type ModeRuleTrigger =
  | { type: "bundle_id"; bundle_id: string }
  | { type: "url_pattern"; url_pattern: string }
  | { type: "field"; field: WorkflowField }
  | { type: "hotkey"; shortcut: string }
  | { type: "manual" };

export type ModeRule = {
  id: string;
  name: string;
  enabled: boolean;
  trigger: ModeRuleTrigger;
  input: WorkflowInput;
  engine: WorkflowEngine;
  language: string | null;
  transform_preset: TransformPreset | null;
  custom_prompt: string | null;
  deterministic_only: boolean;
  output: WorkflowOutput;
  auto_send_on_insert: boolean;
};
