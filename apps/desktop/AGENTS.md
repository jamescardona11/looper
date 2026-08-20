# Agent Rules — apps/desktop

Looper desktop is a macOS and Windows Tauri app with a Rust backend, a
React/TypeScript frontend, and four native windows rather than a routed SPA.
Global rules are in the root `AGENTS.md`.

## Architecture

- Rust owns native, latency-sensitive, privacy-sensitive, and local domain
  logic: windows, hotkeys, audio, local transcription, storage, updater,
  permissions, tray/menu, and text insertion.
- React owns rendering, local interaction state, query cache, and thin command
  and event clients. `src/data/*` is the boundary for Tauri command/event names
  and desktop-only headless Convex orchestration.
- Extend the current owner. Do not create a second router, store, query wrapper,
  service layer, or design system beside an existing one. A genuinely new
  architectural layer requires updating the root architecture overview and a
  migration path, not duplication.
- Keep macOS and Windows behavior behind `platform/{macos,windows}/` and
  `#[cfg]` boundaries.
- `src/file-size-contract.test.ts` is a growth ceiling, not a reason to split a
  cohesive module. Split on responsibility boundaries.

## Native windows

The labels are `main`, `toast`, `meeting-awareness`, and `settings`. Keep their
configuration and behavior aligned across `tauri.conf.json`,
`capabilities/*.json`, `src-tauri/src/lib.rs`, `src-tauri/src/platform/**`, and
`src/app/App.tsx`. The packaged app routes by window label, never by URL;
query-string routing is limited to the browser-only signal preview.

## Owners

- Composition and registration: `src-tauri/src/lib.rs`.
- Capture and transcription: `pill.rs`, `recorder.rs`, `transcribe.rs`, and
  `speech/`. Keep model loading and warming inside `speech/`.
- Settings and secrets: `settings.rs`, `core/settings.rs`, and `crypto.rs`.
- History and library: `storage.rs` and `library/`.
- Native chrome: `toast.rs`, `tray.rs`, and platform menu modules.
- Frontend window routing: `src/app/App.tsx`; settings state:
  `features/settings/useSettingsForm.ts`; model queries and labels:
  `features/settings/models-queries.ts`.
- Frontend feature state stays in its feature directory. `shared/lib/*` is
  static metadata/formatting, and `shared/ui/*` contains reusable primitives.

## Cross-boundary changes

- Persisted settings must stay aligned across Rust schema/persistence,
  `useSettingsForm.ts`, and onboarding when relevant.
- Mode, model, and microphone changes must keep the tray and macOS menu in sync
  and preserve save → menu refresh → `settings:changed`.
- Tauri payload or event changes update the Rust emitter, frontend consumer,
  and `src/types/*` together.
- Permission changes update Tauri capabilities and the relevant macOS plist or
  entitlement files.
- Window changes update native configuration, platform code, and label-based
  frontend routing together.

## Storage and privacy

- `settings.db` owns settings; `transcriptions.db` owns history and library
  records; `app_data_dir/library` owns imported media and exports. Do not add an
  alternate store for the same data.
- Do not log transcripts, audio, prompts, or API keys. Secret handling stays in
  `settings.rs` and `crypto.rs`.

## Verification

- Run `make lint-desktop` for the Tauri data boundary and `make test-desktop`
  for desktop frontend/Rust tests when those surfaces change.
- Run `pnpm --dir apps/desktop build` when frontend types or packaging inputs
  change.
- Exercise the affected native flow when behavior depends on Tauri or the OS;
  unit tests alone are not native evidence.
- Co-locate module tests under `src/`. Reserve `tests/frontend/` for
  cross-cutting build, packaging, or brand contracts that have no module owner.
- Source-reading contract tests may enforce only product, accessibility, or
  architectural invariants that a rendered test, unit test, or type cannot.
