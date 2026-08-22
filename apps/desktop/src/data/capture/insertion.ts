// Data boundary for the "assistive/inserción-selección" domain.
//
// src-tauri/src/assistive.rs itself still exposes paste_text /
// get_selected_text_ax / focused_text_snapshot / copy_text_to_clipboard as
// plain Rust functions (no #[tauri::command]) — the recording→transcription
// loop completes entirely in Rust up to the point of pasting.
//
// F1.2 (preview/cancel) adds the one place the frontend *can* intervene
// before that paste happens: when "preview_before_insert_enabled" is on,
// src-tauri/src/transcribe.rs::process_transcript_text pauses right before
// pasting and waits for one of these two commands (see
// AppState::begin_pending_insertion / resolve_pending_insertion in
// src-tauri/src/lib.rs). The pill shows the editable transcript in the
// meantime (pill:mode event, tone "preview").
import { invoke } from "@tauri-apps/api/core";
import type { EditAction, ModeRuleSuggestion, TransformPreset } from "../../contracts/index";

/** Confirms the pending insertion, pasting `text` (edited or as-is). */
export async function confirmPendingInsertion(text: string): Promise<void> {
  await invoke("confirm_pending_insertion", { text });
}

/** Cancels the pending insertion: the transcript is discarded, not pasted. */
export async function cancelPendingInsertion(): Promise<void> {
  await invoke("cancel_pending_insertion");
}

// F2 (Selection Mode): the pill's action selector shows up after the voice
// instruction is transcribed and before the transform runs (tone
// "action_select" - see PillOverlay.tsx). These resolve
// `AppState::pending_edit_action` in src-tauri/src/lib.rs, gating which
// system prompt/action `llm_cleanup::edit_transcription` uses.

/** Picks the action (and optional "Write Better"/"Prompt Better" preset)
 * for the Selection Mode transform about to run. */
export async function chooseEditAction(
  action: EditAction,
  preset?: TransformPreset,
): Promise<void> {
  await invoke("choose_edit_action", { action, preset: preset ?? null });
}

/** Cancels Selection Mode's action selector: the transform never runs. */
export async function cancelEditAction(): Promise<void> {
  await invoke("cancel_edit_action");
}

// Smart Modes (F5): when the action selector opens, the pill asks whether a
// configured mode rule (app bundle ID or website pattern, see
// `mode_rules.rs`) matches the frontmost app/site, to pre-select a default
// preset - the user can still pick a different one manually before choosing
// the action (see PillOverlay.tsx).

/** Fetches the active Smart Mode rule's suggested preset/auto-send for the
 * frontmost app/site, or `null` if no enabled rule matches. */
export async function getActiveModeRuleSuggestion(): Promise<ModeRuleSuggestion | null> {
  return invoke("get_active_mode_rule_suggestion");
}

// F1.3 (direct AX insertion + verification) adds a second point where the
// frontend can intervene after the fact: every completed auto-insertion
// stores undo state in AppState (see AppState::set_last_insertion in
// src-tauri/src/lib.rs). The final pill exposes the command below as its
// "Undo" action; other insertion sources can still use the toast action.

/**
 * Undoes the most recently completed insertion: restores the previous value
 * directly, or sends a synthetic undo keystroke, depending on how the text
 * was inserted. Only the latest insertion can be undone, and only once -
 * rejects if there is nothing left to undo.
 */
export async function undoLastInsertion(): Promise<void> {
  await invoke("undo_last_insertion");
}
