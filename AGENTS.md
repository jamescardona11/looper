# Agent Rules

> Looper product monorepo. These rules apply repository-wide; nested
> `AGENTS.md` files add only directory-specific guidance.

## Sources of truth

- Use the architecture section in `README.md`, the nearest `AGENTS.md`, and
  package manifests for commands and dependencies.
- If an instruction conflicts with code or tests, surface and reconcile the
  conflict. Do not silently choose one source.

## Architecture

- Web is React/Vite; mobile is React Native/Expo; desktop is Tauri with a Rust
  backend and React frontend; the backend is Convex.
- Extend existing owners and shared packages before creating a parallel layer.
- Web and mobile Convex client mechanics belong in
  `packages/ts/data/src/adapters/convex`; server mechanics belong in
  `backend/convex`. Desktop headless Convex orchestration is the sole exception
  and stays in `apps/desktop/src/data`.
- AI and external-provider calls stay server-side. Use AI SDK adapters, never
  raw provider `fetch` calls or client-side secrets.

## Engineering rules

- Read the implementation, immediate callers, tests, and existing owner before
  editing. Keep the diff scoped to the request.
- Prefer functional, declarative TypeScript. Classes are acceptable when a
  framework or test boundary requires them.
- Use `camelCase` for functions and variables, `PascalCase` for components and
  types, and `kebab-case` for files.
- Avoid broad `any`; isolate generated-type mismatches with a narrow cast.
- Reuse `@looper/config`, `@looper/data`, `@looper/i18n`, and existing UI
  primitives. Check the workspace before adding a dependency or abstraction.
- Keep Lingui locale keys in parity across every supported locale.
- Edit colors in `packages/ts/config/src/palette.ts`, run `make tokens`, and
  never hand-edit generated token files.

## Environment files

- Only deployable units (`apps/desktop`, `apps/mobile`, `apps/web`, and
  `backend`) may own one `.env.example` describing their variables.
- Keep secrets in ignored local environment files. Never commit real keys.
- A tracked `.env.production` may contain public client configuration only.
- Packages, tools, tests, and fixtures must receive configuration from their
  caller and must not add their own environment files.

## Safety boundaries

- Never hardcode or log API keys, transcripts, audio, prompts, or other private
  user data.
- Do not run destructive Git operations such as `reset --hard` or force-push
  unless the user explicitly requests that exact operation.

## Verification

- Run the narrowest relevant checks while iterating. Use `make ci` for broad or
  cross-package changes and the nested `AGENTS.md` commands for scoped work.
- Static and unit checks do not prove native-device behavior, external-provider
  behavior, deployment, or production. Report those evidence boundaries
  explicitly; a skipped capability is missing evidence, not a pass.
