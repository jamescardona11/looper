# Web Context

The web app has a few web-owned modules on top of the shared product surface.

- **App Shell** — the root composition that mounts providers, navigation, global
  overlays, demo auto-seeding, and root error surfaces.
- **Agent Workspace** — the authenticated chat surface that selects or creates
  the active thread, owns the chat header, canvas, and upgrade affordance.
- **Storage Upload** — the browser-side transport that turns a `Blob` or `File`
  into a backend `storageId`. It lives in `src/lib/upload.ts` and is injected
  into `<ConvexProvider>` as the app's `StorageUploader`; the upload protocol
  itself runs inside the `@looper/data` hooks, so feature modules never
  repeat the URL-request/upload sequence.
- **Feature adapter** — a web-owned module over `@looper/data` only when it
  adds web behavior such as browser upload, Tauri redirect, or local UI state.
  Pure domain hooks are imported directly from `@looper/data`.
