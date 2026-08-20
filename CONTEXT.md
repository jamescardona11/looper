# CONTEXT — Looper domain language

Stable vocabulary and ownership for terms that are easy to confuse. Agent rules
live in `AGENTS.md`; the public architecture overview lives in `README.md`.

## Capture and dictation

**Pill / Capture Pill** is the floating dictation overlay and the `main`
Tauri window, not a screen inside the settings shell. Rust owns its lifecycle
and geometry under `apps/desktop/src-tauri/src/pill*`; the frontend state and
rendering live in `apps/desktop/src/features/pill/`.

**Dictation** is a short capture transcribed and inserted into the currently
focused app. Rust owns recording, transcription, and insertion; frontend
command/event clients live in `apps/desktop/src/data/`.

**Selection Mode** applies an edit action or transform preset to text already
selected in the frontmost app. Its native owner is
`src-tauri/src/selection_actions.rs`; frontend types live in
`src/types/pill.ts`.

## Transcription, LibraryItem, and Memory

**Transcription** is the historical record of one dictation: inserted text,
raw text, audio metadata, duration, and shaping context. It is stored in the
`transcriptions` table and owned by `src-tauri/src/storage/`.

**LibraryItem** is a media file managed end-to-end by the Library. It has an
import/recording/meeting kind, a processing lifecycle, and a rich transcript.
It is stored in `library_items` and owned by `src-tauri/src/library/`.

A Transcription is a completed dictation event; a LibraryItem is a long-lived
managed file. A dictation is not promoted into a LibraryItem.

**Memory** is unified local search across dictations, library items, and
meetings. It is a read model, not another store. Its owner is
`src-tauri/src/memory.rs`.

## Meeting

Two independent systems use “meeting”:

- **meeting awareness** decides whether to offer a capture prompt from calendar
  and microphone signals. It owns the `meeting-awareness` window and
  `meeting:awareness_state`.
- **meeting capture** records and transcribes after the user accepts. It owns
  the active-meeting state under `src-tauri/src/library/meeting_capture.rs`.

Awareness answers “should we offer?”; capture answers “are we recording?”.
Awareness queries capture and stands down while capture is active.

A finished **Meeting** is a `library_items` row with meeting details. A
`CaptureIntent` distinguishes a meeting from a personal voice note using the
same recording machinery.

## Personalization

**Personality** is a named writing-style profile bound to apps or websites.
Matching and prompt injection are owned by `src-tauri/src/personalization.rs`
and `src-tauri/src/mode_context.rs`.

**Snippet** has two data meanings:

1. A personalization placeholder such as `{{variable}}`, expanded inside
   Personality instructions.
2. A user text-expander pair where dictating a trigger inserts an expansion.

“Dictionary snippets” is only the UI where user snippets are edited; it is not
a third data type.

**Correction** is a learned word pair inferred from a verified post-insertion
edit. Repeated corrections become suggestions but are never applied
automatically or synced. A **Replacement** is user-authored, applied
automatically, and synced.

## Mode

“Mode” has three meanings:

1. **TranscriptionMode** chooses local or cloud transcription.
2. **ModeRule / Smart Mode** selects a workflow from app, URL, field, hotkey, or
   manual context.
3. **mode_id / mode_name on TranscriptionRecord** records whichever mode rule
   or personality shaped the dictation; it is not always a ModeRule reference.

## Sync

`apps/desktop/src/features/sync/` owns sign-in UI, session state, and the
settings tab. It is not the synchronization engine.

The **sync engine** lives under `apps/desktop/src/data/*-sync.ts` and is
started once by `src/app/runtime/window-services.tsx`. It activates only for
an identified account.

**Remote dictation** is the mobile-to-desktop paste channel. It also uses
Convex but is independent of the sync engine.

## Entitlement

**License gate** is the Rust-owned decision that enables paid capabilities from
paid status, trial status, or a development bypass. Polar is authoritative;
local grants support a bounded offline window. Frontend presentation lives in
`apps/desktop/src/features/license/`.

The settings UI calls this domain **Account**. It is distinct from the **Sync**
tab, which represents Convex identity.
