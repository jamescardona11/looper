<h1 align="center">
  <img src="assets/brand/looper-logo.svg" alt="Looper" width="360">
</h1>

<p align="center">
  <strong>Voice productivity across desktop, mobile, and web.</strong>
</p>

<p align="center">
  <a href="https://github.com/jamescardona11/looper/releases/latest"><strong>Download Desktop</strong></a> ·
  <a href="#product">Product</a> ·
  <a href="#getting-started">Getting started</a> ·
  <a href="#architecture">Architecture</a> ·
  <a href="#verification">Verification</a> ·
  <a href="LICENSE">AGPL-3.0-or-later</a>
</p>

---

## Product

Looper turns speech into text where you are already working. On desktop, hold
the shortcut, speak, and release: Looper transcribes locally or through the
configured cloud provider, then inserts the result into the focused app.

Longer recordings and meetings live in the Library with playback, searchable
transcripts, speakers, markers, exports, and a unified local Memory. Voice
profiles, dictionary entries, replacements, snippets, and workflows control
how the final text is written.

<p align="center">
  <img src="assets/product/desktop-workspace.png" alt="Looper desktop workspace showing local dictation activity, recoverable history, and the next meeting" width="100%">
</p>

<p align="center">
  <sub>Desktop product direction: local dictation, recoverable history, and meeting context in one workspace.</sub>
</p>

### What you can do

- Dictate into any desktop app with global shortcuts and text insertion.
- Choose local transcription for on-device processing or configure a remote
  speech provider.
- Record meetings, import media, follow live transcription, and export the
  result.
- Search dictations, recordings, and meetings from one local index.
- Capture from mobile and send remote dictation to an authenticated desktop.
- Use the browser workspace to review synchronized transcriptions, notes, and
  meetings, ask the recording assistant, and manage account and billing.

### Meetings stay reviewable

Looper keeps the source audio, transcript, decisions, moments, and assistant in
one note. Generated summaries remain connected to the recording they came
from, so the useful output never replaces the original.

<p align="center">
  <img src="assets/product/desktop-note-detail.png" alt="Looper desktop meeting note with retained source audio, decisions, transcript tabs, and an assistant input" width="100%">
</p>

### Mobile capture

Mobile covers the same lifecycle at phone scale: dictate, follow a live
recording, and return to a structured meeting note.

| Dictation | Live capture | Meeting note |
| --- | --- | --- |
| ![Looper mobile dictation history and weekly local activity](assets/product/mobile-dictation.png) | ![Looper mobile live meeting capture with transcript and recording controls](assets/product/mobile-capture.png) | ![Looper mobile meeting note with summary, actions, moments, and source audio](assets/product/mobile-meeting.png) |

_These mobile previews come from the real Expo Release app through the
repository's deterministic Goldie capture flows. Availability can vary by
platform and release._

### Web review

The browser workspace reads synchronized content and manages the vocabulary,
styles, account, usage, and billing surfaces around it. Recording and native
capture remain owned by Desktop and Mobile.

<p align="center">
  <img src="assets/product/looper-web-home-campaign-en.png" alt="Looper Web home showing synchronized dictations, notes, and meetings" width="100%">
</p>

| Meeting review | Studio |
| --- | --- |
| ![Looper Web meeting review with decisions, owners, open questions, and transcript](assets/product/looper-web-meeting-campaign-en.png) | ![Looper Web Studio with synchronized vocabulary, replacements, and writing styles](assets/product/looper-web-studio-campaign-en.png) |

_These Web previews are Retina captures of the real Vite application. Run
`pnpm web:previews` to seed an isolated anonymous preview account and reproduce
the campaign assets._

### Repository surfaces

| Surface | Stack | Responsibility |
| --- | --- | --- |
| `apps/desktop` | Tauri, Rust, React | Native capture, local transcription, insertion, Library, Memory, meetings, and settings |
| `apps/mobile` | React Native, Expo | Mobile capture, notes, meetings, Library, Android local STT, and the iOS keyboard extension |
| `apps/web` | React, Vite | Browser-only workspace for synchronized Library views, agent, voice preferences, account, usage, and billing; never capture |
| `backend` | Convex | Authentication, sync, meetings, notes, AI/provider calls, usage, and payments |
| `packages/ts` | TypeScript | Shared configuration, i18n, domain types, and the web/mobile Convex client boundary |
| `packages/rust` | Rust | Shared audio and transcription engines |

---

## Getting started

### Download Desktop

Desktop installers for macOS 14+ and Windows are published manually in
[GitHub Releases](https://github.com/jamescardona11/looper/releases/latest).
The operating systems may warn while these preview installers remain unsigned.
Updater packages are signed separately and verified by the desktop app.

To create a local macOS download for QA or a private handoff, run:

```sh
make build-download
```

This produces unsigned `Looper.app` and `.dmg` bundles under
`apps/desktop/src-tauri/target/release/bundle/`. They are suitable for local
testing only; the signed macOS and Windows installers come from the manual
`Desktop release` workflow on `main`.

### Requirements

- Node.js 22.18 or newer
- pnpm 10 or newer
- Rust 1.88 or newer for desktop and local transcription
- macOS 14 or newer when building the macOS desktop target

Install the workspace once:

```sh
make install
```

### Desktop

```sh
make dev
```

Desktop capture and local features can run without Convex. To enable account,
sync, and remote-dictation features, copy `apps/desktop/.env.example` to
`apps/desktop/.env.local` and set `VITE_CONVEX_URL`.

### Mobile

```sh
cp apps/mobile/.env.example apps/mobile/.env.local
pnpm --filter @looper/mobile prebuild
pnpm --filter @looper/mobile ios       # or: android
```

The keyboard and local speech engine contain native code, so mobile requires
an Expo development build rather than Expo Go. Set `EXPO_PUBLIC_CONVEX_URL`
before starting it.

### Web and backend

Configure the checked-in examples first:

```sh
cp backend/.env.example backend/.env.local
cp apps/web/.env.example apps/web/.env.local
```

Then run the backend and web app in separate terminals:

```sh
pnpm --filter @looper/backend dev
pnpm --filter @looper/web dev
```

Provider credentials stay in the backend environment. Do not place AI,
payment, or email-provider secrets in a client environment.

---

## Architecture

```text
Web workspace ──┐
                ├── @looper/data ─────────────┐
Mobile ─────────┘                             │
                                               ▼
Desktop React ── src/data ──┬────────────── Convex backend ── external providers
                            │                  ▲
                            ▼                  │ selected opt-in projections
                      Tauri commands/events ───┘
                            │
                            ▼
                     Rust local core ── OS, storage, audio, local models
```

The boundaries that matter:

- Rust owns desktop native behavior, privacy-sensitive local state, audio,
  transcription routing, storage, windows, hotkeys, and insertion. React owns
  presentation and local interaction state.
- React follows runtime ownership: Desktop React stays in `apps/desktop`, Web
  React stays in `apps/web`, and applications never import one another. Pure
  contracts or presentation used by multiple applications belong in
  `packages/ts`; a shared package is not a holding area for hypothetical reuse.
- `apps/desktop/src/data` owns Tauri command/event names and the desktop's
  headless Convex clients. Desktop does not consume `@looper/data` because its
  workers run outside one shared React tree.
- Web and mobile consume Convex through `@looper/data`; server implementation
  stays in `backend/convex`.
- Web reads synchronized content and may update shared account and voice
  preferences. Capture-derived writes stay with Desktop or Mobile; Web must
  not use Tauri, `MediaRecorder`, microphone access, or browser STT.
- The packaged desktop routes its four native windows by Tauri label, not URL.
- AI and external-provider calls stay server-side unless the desktop feature is
  explicitly configured for a user-owned local or remote provider.
- Colors originate in `packages/ts/config/src/palette.ts`. Run `make tokens`
  after changing the palette; generated targets must not be edited directly.
- TypeScript unit tests live in the nearest `__tests__/`; application-wide
  integration tests live in `tests/`, and browser end-to-end tests in `e2e/`.

Directory-specific constraints live in the nearest `AGENTS.md`. Stable product
vocabulary is defined in `CONTEXT.md`.

---

## Verification

```sh
make ci             # portable static checks and unit tests
make build-all      # build every workspace package
make test-desktop   # desktop frontend, Tauri Rust, audio, and STT tests
make test-mobile    # mobile typecheck and tests
pnpm run qa:local-full
```

Static checks, unit tests, and local builds do not prove physical microphone
capture, native permissions, device behavior, external providers, deployment,
release signing, or store distribution. Treat an unexecuted capability as
missing evidence, not as a pass.

---

## License

Original Looper contributions are licensed under
[GNU AGPLv3 or later](LICENSE). See [COPYRIGHT](COPYRIGHT) and
[third-party notices](THIRD_PARTY_NOTICES.md) for retained upstream terms and
open distribution checks.

<p align="center">
  <sub>Looper · AGPL-3.0-or-later</sub>
</p>
