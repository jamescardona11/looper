# Agent Rules

> Looper product repository.

## Stack

- **Web**: React 19 + Vite + TanStack Router + Tailwind CSS v4 + shadcn/ui
- **Mobile**: React Native/Expo shell backed by the shared Convex contracts
- **Backend**: Convex via `@looper/data`
- **AI**: Vercel AI SDK v6 (`streamText`)
- **Auth**: Convex Auth behind `@looper/data`
- **Payments**: Stripe + Polar + RevenueCat (mobile IAP)
- **i18n**: Lingui v6 (@looper/i18n package)

## DO

- Read existing files before editing; understand imports and structure first
- Keep diffs minimal and scoped to the request
- Use existing shared packages (`@looper/config`, `@looper/data`, `@looper/i18n`)
- Backend: AI/external API calls stay server-side in Convex; keys never enter app code
- Web: use Tailwind utility classes (`bg-background`, `text-foreground`, etc.)
- Follow existing patterns in the codebase before inventing new ones
- Run `pnpm vitest run` in backend after backend changes

## DON'T

- Run destructive commands (`reset --hard`, force-push) without permission
- Use `any` type broadly — prefer `as any` on specific generated-type mismatches only
- Install packages without checking if an equivalent exists in the monorepo
- Create new UI components if one exists in `@/shared/components/ui`
- Use raw `fetch` to OpenAI/Anthropic/Google — use AI SDK v6 (`streamText`)
- Use `openai` npm package — use `@ai-sdk/openai` instead
- Hardcode API keys — use provider runtime env/secrets in backend functions/actions

## Code Conventions

- TypeScript: functional, declarative; no classes (except Convex component wrappers)
- File layout: exported component → subcomponents → helpers → types
- Naming: `camelCase` for functions/variables, `PascalCase` for components/types, `kebab-case` for files
- Imports: `@looper/*` for shared packages, `@/` for app-internal paths
- Convex functions: use `v.*` validators, `getAuthUserId` for auth, `internal` for scheduling
- Convex client and server mechanics stay inside `packages/ts/data/src/adapters/convex`
  or `backend/convex`

## Project Structure

```
backend/convex/     — Convex functions (queries, mutations, actions)
apps/web/           — React + Vite web app
packages/ts/config/    — Shared config for selected modules
packages/ts/data/      — Convex-facing product data boundary (`@looper/data`)
packages/ts/i18n/      — Lingui i18n (en + es locales)
```


## Convex Components

Convex components are owned by active modules and pruned from `backend/convex/convex.config.ts` when their module is disabled.

## AI Models Configured

OpenAI: gpt-4.1, gpt-4o, gpt-4o-mini, o3, o4-mini
Anthropic: opus-4-7, sonnet-4-6, haiku-4-5
Google: gemini-2.5-pro, gemini-2.5-flash, gemini-2.5-flash-lite

## Testing

- pnpm/Turbo unit layer: `make test`; it excludes device/native verification.
  Do not rely on hardcoded test counts.
- pnpm/Turbo typecheck layer: `make typecheck`.
- Mobile requires `pnpm --filter @looper/mobile typecheck` and its Vitest suite.
- Treat a skipped capability as missing release evidence, not a passing
  assertion.
