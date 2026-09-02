# Product captures

Goldie produces deterministic iPhone screenshots from the real Expo app. The
Release build enables `EXPO_PUBLIC_PRODUCT_PREVIEW`, which seeds an isolated
anonymous account with sample notes and a meeting. Normal builds never run the
seeder.

```sh
pnpm goldie:build
pnpm goldie:doctor
pnpm goldie:capture
pnpm goldie:frame
pnpm goldie:manifest
pnpm goldie:verify
```

`apps/mobile/.env.local` must contain a working `EXPO_PUBLIC_CONVEX_URL`. Raw
captures and generated store assets stay under `goldie/out/` and are ignored;
only selected images copied into product documentation are versioned.

`pnpm goldie:capture` intentionally records English and Spanish in two passes.
Goldie keeps one raw capture per device, so a single multi-locale pass would
translate only the marketing frame while reusing the same in-app pixels.
