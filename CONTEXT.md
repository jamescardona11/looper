# CONTEXT — Looper domain language

Glossary of the terms this repository actually uses, with the code that owns
each one. Written from the code, not from intent: when a word means more than
one thing, all the meanings are listed.

The `AGENTS.md` files (root, `apps/desktop`, `backend/convex`, `packages`) are
agent rules. Architectural decisions live in `docs/adr/`. This file only fixes
vocabulary.

---

## Capture and dictation

**Pill** / **Capture Pill**
The floating overlay that shows dictation state. It is the `main` Tauri window,
not a component inside another screen.
Rust: `src-tauri/src/pill.rs` (shortcut-driven recording lifecycle, overlay
state, media pause/resume), `src-tauri/src/capture_pill.rs` (geometry and the
`CapturePillPresentation` = `dock | floating` / `CapturePillDockPosition`
enums), `src-tauri/src/pill_layout.rs`, `src-tauri/src/pill_controller_state.rs`.
Frontend: `src/features/pill/` (XState + canvas overlay), `src/types/pill.ts`
(`PillStatus`, `PillTone`), `src/data/overlay.ts`.

**Dictation**
A short capture that is transcribed and inserted into whatever app currently
has focus. It is the hot path the desktop `AGENTS.md` names:
invoke → record → transcribe → insert.
Rust: `src-tauri/src/transcribe.rs` (orchestration), `src-tauri/src/recorder.rs`
(audio), `src-tauri/src/assistive.rs` (insertion).
Frontend: `src/data/dictation.ts`, `src/data/insertion.ts`.

**Selection Mode**
The variant of dictation that operates on text already selected in the
frontmost app: the pill offers an `EditAction` (`replace | insert | ask | copy`)
and a `TransformPreset` (`polish | literal | chat | email | prompt_better`).
Rust: `src-tauri/src/selection_actions.rs`. Frontend: `src/types/pill.ts`
(`EDIT_ACTIONS`, `TRANSFORM_PRESETS`), `src/features/pill/PillOverlay.tsx`.

---

## Records: Transcription vs LibraryItem

These are two different tables in the same SQLite file
(`transcriptions.db`, schema in `src-tauri/src/storage/schema.rs`). They are
not two views of one entity.

**Transcription**
The historical record of ONE dictation: the inserted text, the raw text before
LLM cleanup, the audio path, word count, duration, and which mode/app it was
produced in. Rows live in the `transcriptions` table.
Type: `src/types/transcription.ts` (`TranscriptionRecord`,
`TranscriptionStatus` = `success | error`).
Rust: `src-tauri/src/storage.rs`, `src-tauri/src/storage/transcriptions.rs`.
Frontend: `src/features/transcriptions/`, `src/data/transcription/history.ts`.

**LibraryItem**
A media file the Library owns end-to-end: imported from disk, recorded, or
produced by a meeting. It carries the file (`audio_path`, `source_path`,
`original_format`, `file_size_bytes`), a processing status
(`pending | recording | importing | transcribing | complete | cancelling |
cancelled | error`, with `progress` on `importing` and `transcribing`),
and a rich transcript (`segments`, `words`, `speakers`). Rows live in the
`library_items` table with `kind` ∈ `import | recording | meeting`.
Type: `src/types/library/items.ts` (`LibraryItem`, `LibraryItemKind`,
`LibraryItemStatus`, `TranscriptSegment`, `Speaker`).
Rust: `src-tauri/src/library/repo.rs`, `library/processing.rs`, `library/queue.rs`.
Frontend: `src/features/library/`, `src/data/library/`.

**Difference.** A Transcription is a *dictation event* — short, already
inserted somewhere else, no per-item lifecycle, no speakers, no segments. A
LibraryItem is a *file under management* — long-lived, re-transcribable,
translatable (`library_translations`), with progress and cancellation. Nothing
promotes one into the other; a dictation never becomes a LibraryItem.

**Memory**
Local unified search *across* both of the above plus meetings. It is a read
model, not a store: `MemorySource` is exactly `dictation | library | meeting`.
Rust: `src-tauri/src/memory.rs`. Frontend: `src/data/memory.ts`,
`src/features/memory/`.

---

## Meeting — two systems, one word

There are two independent subsystems whose names both start with "meeting".
They collaborate but own different questions.

**meeting_awareness** — *"is a call probably starting?"*
Polls the calendar (macOS EventKit) and the microphone to decide whether to
offer the user a prompt. Its phases are
`Idle | Upcoming | Ready | Detected` (`MeetingAwarenessPhase`), where
`Detected` means "another app opened the mic and no calendar event explains it".
It owns the `meeting-awareness` Tauri window and emits
`meeting:awareness_state`. It is an *offer*, not a state: a detected prompt
expires after `DETECTED_PROMPT_TTL_SECONDS`.
Rust: `src-tauri/src/meeting_awareness.rs` +
`src-tauri/src/meeting_awareness/{calendar_macos,calendar_unsupported}.rs`,
`src-tauri/src/awareness_notification.rs`.
Frontend: `src/data/meeting-awareness.ts`.

**library/meeting_capture** — *"record and transcribe the meeting"*
Runs the actual capture once the user accepts: mic + optional system audio,
live transcription, note markers, silence watchdog, summary. Its phases are
`idle | starting | recording | finalizing | error` (`MeetingCapturePhase`).
Rust: `src-tauri/src/library/meeting_capture.rs`, `meeting_live_transcription.rs`,
`meeting_silence.rs`, `meeting_summary.rs`, `meeting_commands.rs`.
Frontend: `src/data/library/meetings.ts`, `src/data/live-meeting.ts`,
`src/types/library/meetings.ts`.

**Source of truth for "there is an active meeting":**
`meeting_capture` — specifically `AppState::meeting_capture().is_active()`.
`meeting_awareness` does not track it; it *queries* it and stands down when it
is true (see `meeting_awareness.rs`, the poll loop and `hide_prompt_if_safe`).
Awareness answers "should we offer?", capture answers "are we recording?".

**Meeting (the record).** A finished meeting is a `library_items` row with
`kind = 'meeting'` plus a `meeting_details` row (notes, `notes_revision`,
summary, `calendar_context`, `note_markers`, `live_transcript`).

**CaptureIntent** (`meeting | voice_note`) distinguishes a full meeting capture
from a long personal voice note that uses the same recording machinery.

---

## Personalization

**Personality**
A named AI writing-style profile bound to apps and/or websites: `{ id, name,
enabled, apps, websites, instructions }`. When the frontmost app or site
matches a binding, its instructions are injected into the LLM cleanup prompt.
Rust: `src-tauri/src/personalization.rs` (CRUD + limits),
`src-tauri/src/settings_model.rs` (`Personality`),
`src-tauri/src/mode_context.rs` (matching against the active app/site).
Frontend: `src/types/settings/personalization.ts`,
`src/features/personalization/`, `src/data/personalization.ts`.

**Snippet — three unrelated meanings**

1. **Personalization snippet** — a `{{variable}}` placeholder expanded inside a
   Personality's instructions (app name, window title, website, url, date).
   Owner: `src-tauri/src/personalization_snippets.rs` (`SnippetContext`,
   `expand_personalization_snippets`). Nothing user-authored is stored here;
   these are template variables.
2. **User snippet** — the user's text expander: dictating `trigger` inserts
   `expansion`. Stored in settings as `user_snippets: { trigger, expansion }[]`.
   Applied in the dictation pipeline right after dictionary replacements.
   Owner: `src-tauri/src/user_snippets.rs`; type
   `src/types/settings/personalization.ts` (`UserSnippet`).
3. **"Dictionary snippets"** — not a third data type: the *UI surface* where
   user snippets are edited, which lives inside the Dictionary screen next to
   the dictionary and its replacements.
   Owner: `src/features/dictionary/components/DictionarySnippetsSection.tsx`,
   `dictionary-cache-policy.ts`; synced by `src/data/snippets-sync.ts`.

Meanings 2 and 3 are the same data seen from Rust and from the settings UI.
Meaning 1 shares only the word.

**Correction**
A learned `from → to` word pair, observed by re-reading the same accessibility
element ~30s after a verified insertion and diffing what the user changed. A
pair seen at least twice becomes a *suggestion* in settings; accepting it adds
the term to the local dictionary. Nothing is ever auto-applied and none of it
syncs.
Rust: `src-tauri/src/corrections.rs`, `src-tauri/src/auto_dictionary.rs`.
Frontend: `src/data/corrections.ts`.
Not to be confused with **Replacement** (`{ from, to }` in settings), which the
user writes by hand and which *is* applied automatically.

---

## Mode — three meanings

1. **TranscriptionMode** — a settings enum, `Local | Cloud`, choosing where
   transcription runs. Default `Local`.
   Owner: `src-tauri/src/settings_model.rs`, `settings_policy.rs`; surfaced in
   the tray and the macOS app menu.
2. **Mode rule / Smart Mode** — a per-context automation rule (`ModeRule`):
   a `ModeRuleTrigger` (`bundle_id | url_pattern | field | hotkey | manual`)
   plus a workflow (`input`, `engine`, `language`, `transform_preset`,
   `custom_prompt`, `output`). The pill asks
   `get_active_mode_rule_suggestion` to pre-select a transform for the
   frontmost app/site.
   Owner: `src-tauri/src/mode_rules.rs`, `src-tauri/src/mode_context.rs`;
   type `src/types/settings/workflows.ts`.
3. **`mode_id` / `mode_name` on a TranscriptionRecord** — provenance of the
   dictation, and it is *overloaded*: `transcribe.rs` writes the ModeRule id
   when a workflow matched, and otherwise the Personality id. Read it as
   "whatever profile shaped this dictation", not as a ModeRule reference.

---

## Sync — the name is split across two places

**`src/features/sync/` is not the sync engine.** It is the sign-in UI only:
an email + OTP form, a session store, and a settings tab. 615 lines total
(427 of code, 188 of test) across `SyncTab.tsx`, `sync-session-store.ts` and
`useSyncSession.ts`. It exists as its own tab because "Account" already means
"license" in this app's UI (see the comment at the top of `SyncTab.tsx`).

**The actual synchronization engine has no `features/` representation.** It is
868 lines under `src/data/`:
`sync-engine.ts` (165, the orchestrator that wires auth state to the workers),
`dictionary-sync.ts` (328), `snippets-sync.ts` (195),
`history-sync.ts` (90), `settings-sync.ts` (90).
It is started once from the `main` window
(`src/app/runtime/window-services.tsx`, `mainWindowServices`; the header
comment in `sync-engine.ts` still points at an older
`app/providers.tsx` / `SyncEngineBridge` location), and it stays a no-op
until a real (non-anonymous) session exists — the anonymous session that `convex-auth.ts` keeps alive for remote
dictation never triggers it.

So: *"the Sync feature"* is ambiguous. Say **Sync tab** for the UI and
**sync engine** for `src/data/*-sync.ts` + `sync-engine.ts`.

**Remote dictation** is unrelated to the sync engine despite also using Convex:
it is the mobile → desktop paste channel, desktop acting as receiver.
Owner: `src/data/remote-dictation.ts`, `backend/convex/dictation/remote.ts`.

---

## Entitlement

**License gate**
The single boolean that decides whether paid capability is available:
`license_gate_active = paid_active || trial_active || development_bypass`
(`src-tauri/src/license.rs`). Note the polarity — `true` means *allowed*, not
*blocked*. Memoized for 60s (`GATE_MEMO_TTL`). Polar is authoritative; local
grants are encrypted and trusted only inside a bounded offline window
(`OFFLINE_TRUST`, 7 days) after a 14-day trial (`TRIAL_LENGTH`).
Callers: `local_llm/mod.rs`, `core/settings_runtime.rs`,
`desktop_runtime/state.rs`, `library/meeting_capture.rs`,
`library/commands/recovery.rs`.
Frontend: `src/data/license.ts`, `src/features/license/`.
In the settings UI this domain is called **Account** — distinct from the
**Sync** tab, which is the Convex identity.

---

## Storage locations

- `settings.db` — settings KV (`src-tauri/src/settings.rs`, `core/settings.rs`,
  `settings_store.rs`). Also holds correction counters and dismissals.
- `transcriptions.db` — `transcriptions`, `library_items`,
  `library_translations`, `library_watch_folders`, `library_watch_files`,
  `meeting_details`, `lifetime_stats` (`src-tauri/src/storage/schema.rs`).
- `app_data_dir/library` — imported media, transcoded files, exports.

There are no alternate stores for settings or history.
