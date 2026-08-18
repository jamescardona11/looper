<!-- Keep the title in Conventional Commit style, e.g. `feat(web): add artifact runner`. -->

## What & why

<!-- One or two sentences. What does this change and what problem does it solve? -->

## Scope

- [ ] Backend (`backend/convex`)
- [ ] Web (`apps/web`)
- [ ] Mobile (`apps/mobile`)
- [ ] Desktop (`apps/desktop`)
- [ ] Packages / config
- [ ] Docs only

## How to test

<!-- Steps a reviewer can follow to verify the change locally. -->

## Checklist

These mirror the CI gates — green locally means green in CI.

- [ ] `pnpm typecheck` passes (backend + web + mobile)
- [ ] `pnpm test` passes (vitest: backend + i18n)
- [ ] `pnpm check` is clean (Biome lint + format)
- [ ] `pnpm build` succeeds for any app I touched
- [ ] Web/mobile parity kept where the feature applies to both
- [ ] Env vars: declared in the relevant `.env.example` and set via `npx convex env set` (never committed)
- [ ] No secrets, API keys, or `.env*` files in the diff

## Screenshots / recordings

<!-- For any UI change. Delete if not applicable. -->

## Related

<!-- Closes #123, follows up on #456. -->
