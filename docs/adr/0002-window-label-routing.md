# 0002 — The desktop app routes by Tauri window label, not by URL

## Status

Accepted. Describes a decision already implemented.

## Context

`apps/desktop` ships four native windows, declared in
`src-tauri/tauri.conf.json`:

| label | role |
| --- | --- |
| `main` | the Capture Pill — the always-present floating dictation overlay |
| `toast` | transient notification surface |
| `meeting-awareness` | the call/calendar prompt |
| `settings` | the full application shell (settings, history, library) |

These are not screens. They are separate OS windows with different sizes,
decorations, transparency, always-on-top behavior, focus policy and Tauri
capability grants (`src-tauri/capabilities/*.json`). Three of them are
chromeless overlays that must never take focus from the app the user is
dictating into.

A router (TanStack Router, React Router) assumes one document whose URL
identifies the current view. Here there are four documents, each a separate JS
realm, each with a fixed identity assigned by Rust at creation time. The URL
carries no information: every window loads the same entry point.

## Decision

`src/app/App.tsx` reads `getCurrentWindow().label` once, at mount, and
`src/app/window-route.ts` maps it to a `DesktopWindowRoute`:

```
settings          -> "settings"
meeting-awareness -> "meeting-awareness"
toast             -> "toast"
anything else     -> "main-overlay"
```

`SettingsWindow` renders the `settings` route; `OverlayWindows` switches over
the other three. No router library is installed for the desktop app, and no
navigation happens between windows — Rust shows and hides them.

`apps/desktop/AGENTS.md` states it as a rule:
`app/App.tsx` "routes by Tauri window label, not URL", and window labels and
behavior "must stay aligned across `tauri.conf.json`, `capabilities/*.json`,
`src-tauri/src/lib.rs`, `src-tauri/src/platform/**`, and `src/app/App.tsx`".

**One documented exception.** When `VITE_SIGNAL_PREVIEW=1`, the app runs in a
plain browser with no Tauri runtime. There is no window label to read, so
`App.tsx` forces the label to `settings` and `resolvePreviewRoute()` reads
`?surface=` from the query string to pick among
`dashboard | floating | motion | pill | onboarding`. This is a design-preview
surface only (`src/features/preview/`); it never runs inside the packaged app.

## Consequences

**What follows from this**

- Adding a window is a five-file change, not a route entry: `tauri.conf.json`,
  the matching `capabilities/*.json`, the Rust window lifecycle, the
  `DesktopWindowRoute` union, and `OverlayWindows`. A label added on one side
  and not the other fails at runtime with a blank window, not at build time.
- Window label is read once into `useState`. It cannot change for the lifetime
  of the realm, and nothing should be written to make it look like it can.
- Cross-window communication is Tauri events, not shared React state. Tauri
  broadcasts app events to every window, which is why `settings:changed`
  emitted from an edit in the `settings` window reaches the sync engine
  running in `main`.
- Anything that must exist exactly once in the process runs in `main`, the
  only always-alive window — see `startWindowServices` in
  `src/app/runtime/window-services.tsx`, which returns a no-op for any other
  label.
- Per-window realms also mean per-window module state: `localStorage` is the
  only thing shared. `src/data/convex-auth.ts` listens for cross-window
  `storage` events for exactly this reason.

**What this forbids**

- Installing a router for the desktop app, or introducing URL-driven state.
- Treating the four windows as tabs of one shell, or lifting state "up" out of
  a window.
- Assuming a module singleton is a process singleton.
