# Agent Rules

> Looper product monorepo. These rules apply repository-wide; nested
> `AGENTS.md` files add only directory-specific guidance.

## Sources of truth

- Use accepted ADRs in `docs/adr/` for architecture and package manifests for
  commands and dependencies.
- If an instruction conflicts with code, tests, or an ADR, surface the conflict
  and reconcile it. Do not silently choose one source.

## Architecture

- Web is React/Vite; mobile is React Native/Expo; desktop is Tauri with a Rust
  backend and React frontend; the backend is Convex.
- Extend existing owners and shared packages before creating a parallel layer.
- Web and mobile Convex client mechanics belong in
  `packages/ts/data/src/adapters/convex`; server mechanics belong in
  `backend/convex`. Desktop headless Convex orchestration is the documented
  exception and stays in `apps/desktop/src/data` (ADR 0004).
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
