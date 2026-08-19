# Looper

Looper is a voice productivity workspace with a Tauri desktop app, a React
Native/Expo mobile app, a React web app, and Convex-backed shared contracts.

## Requirements

- Node.js 20.11 or newer
- pnpm 10 or newer
- Rust 1.88 or newer for the desktop and local transcription crates
- macOS 14 or newer for the macOS desktop target

## Install

```sh
pnpm install --frozen-lockfile
```

## Common commands

```sh
pnpm run verify
pnpm run build
pnpm run typecheck
pnpm --dir apps/desktop tauri dev
pnpm --filter @looper/mobile prebuild
pnpm --filter @looper/mobile ios
```

The desktop Tauri commands are owned by `apps/desktop`; they are not root
scripts. Mobile native code requires an Expo development build rather than
Expo Go. Android can use local Parakeet when its model is installed. The iOS
keyboard extension uses the remote provider because its sandbox cannot read the
host app's private model directory.

## Evidence boundaries

Unit tests, typechecks, and local builds do not prove physical microphone
capture, native permissions, device behavior, production backend connectivity,
store distribution, or release signing. The current evidence and open cases
are recorded under [`docs/rebuild`](docs/rebuild/README.md).

## Licensing

Original Looper contributions are licensed under GNU AGPLv3 or any later
version. See [`COPYRIGHT`](COPYRIGHT), [`LICENSE`](LICENSE), and
[`NOTICE.md`](NOTICE.md). Third-party component notices remain in the package
that owns the corresponding asset or adapted source. Historical provenance is
kept in [`docs/rebuild`](docs/rebuild/README.md), separate from distribution
notices.
