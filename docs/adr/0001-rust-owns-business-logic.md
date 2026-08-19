# 0001 — Rust owns the business logic; React is a thin command/event client

## Status

Accepted. Describes a decision already implemented across the desktop app.

## Context

`apps/desktop` is a Tauri application: a Rust binary that owns native windows
and a React/TypeScript frontend rendered inside them. That split admits two
very different architectures. Either the frontend is the application and Rust
is an FFI layer, or Rust is the application and the frontend is a view.

The product constraints pushed to the second one:

- **Latency.** The hot path is invoke → record → transcribe → insert. Routing
  audio frames, VAD, chunking, or text insertion through a JS realm adds a
  serialization boundary to a path measured in milliseconds.
- **Native behavior.** Global hotkeys, accessibility APIs (reading the
  selected text and the focused element), microphone and system audio, tray
  and menu bar, window focus and overlay z-order, permissions, updater — none
  of this exists in the webview.
- **Privacy.** Transcripts, audio, and API keys stay local by default.
  Keeping them in Rust keeps them out of a webview that renders remote-ish
  content and out of any accidental console/telemetry path.
- **Multi-window.** Each Tauri window is a separate JS realm with its own
  module instances. Any state held in the frontend is per-window state; only
  Rust has a single process-wide view.

This is stated in `apps/desktop/AGENTS.md`, section *Mental model*:

> Rust owns business logic, native windows, hotkeys, audio, transcription,
> storage, updater, permissions, tray/menu, and privacy-sensitive code.
> React owns rendering, local interaction state, query cache, and thin
> command/event clients.

## Decision

Rust is the application. The frontend renders it.

Concretely:

- Every domain rule — recording lifecycle, transcription routing (local vs
  remote), dictionary and snippet expansion, personality and mode-rule
  matching, LLM cleanup, license gating, library queue and processing,
  meeting capture and awareness, storage and migrations — lives in
  `src-tauri/src/`.
- The frontend holds only: rendering, local interaction state, the React
  Query cache, and typed wrappers over `invoke`/`listen`.
- Rust is the emitter of truth. State reaches the UI as Tauri events
  (`transcription:complete`, `settings:changed`, `meeting:awareness_state`,
  `meeting:capture_state`, …), and the frontend reacts.
- Each domain has a named Rust owner. `apps/desktop/AGENTS.md`
  (*Backend ownership*) enumerates them; new behavior extends an existing
  owner rather than adding a parallel one.

The proportions match: ~70.8k lines of Rust under `src-tauri/src/` against
~57.9k lines of non-test TypeScript/TSX under `src/`, and the TypeScript side
includes the whole design system, four window shells and all i18n.

## Consequences

**What follows from this**

- A feature is not "done in the frontend". A persisted setting means touching
  `settings.rs`, `core/settings.rs`, `useSettingsForm.ts`, and onboarding if
  it is first-use relevant. A new transcription payload means touching the
  Rust emitter, the frontend consumer, and `src/types/*` together.
- Frontend types are *mirrors*, not definitions. `src/types/pill.ts`,
  `src/types/library/*.ts` and `src/types/settings/*.ts` restate Rust structs
  under serde's rename rules. They drift silently — the contract tests next to
  them (`*.contract.test.ts`) exist because nothing else catches it.
- Most business logic is not reachable from Vitest. Verification of the hot
  path is `cargo test` plus running the app, not frontend tests.
- The frontend cannot be swapped for a different renderer cheaply, but it also
  cannot corrupt domain state.

**What this forbids**

- Adding a service layer, store, or domain model in TypeScript.
  `shared/lib/*` is static metadata and formatting only — explicitly "not a
  service layer" (`apps/desktop/AGENTS.md`, *Frontend ownership*).
- Deriving domain decisions in React from raw events. If the UI needs to know
  something, Rust computes it and emits it. `license_gate_active` is the
  model: one boolean crosses the boundary, not the trial dates plus the rule.
- Duplicating a rule on both sides "for responsiveness".
- Holding cross-window state in the frontend. It is per-window by construction
  (see ADR 0002).
