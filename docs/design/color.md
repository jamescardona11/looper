# Color

Looper's palette is generated. There is exactly one place a color is written
(`packages/ts/config/src/palette.ts`) and one command that propagates it:

```bash
node tools/tokens/generate.mjs          # rewrite the three targets
node tools/tokens/generate.mjs --check  # fail if they drifted
```

`tools/tokens/generate.test.mjs` runs that check in CI, so a hand-edited token
file fails the build instead of silently diverging.

## Generated targets

| File | Surface |
| --- | --- |
| `apps/web/src/app/tokens.generated.css` | Web (Tailwind v4 / shadcn names) |
| `apps/desktop/src/app/styles/tokens.colors.generated.css` | Desktop (Tauri) |
| `apps/mobile/src/shared/theme/colors.ts` | Mobile (React Native) |

`foundation.css` keeps typography, shadows and radii — no colors. Mobile gets a
TypeScript object because React Native cannot read CSS variables.

## The rules

- Neutrals carry no chroma at all. Black and white are the protagonists and the
  accent is the only color in the interface, so the greyscale stays neutral at
  every step. Tinting it with the brand hue was tried and reverted: the
  background stopped reading as black.
- Dark backgrounds retain visible lightness steps. Light elevation may rely on
  borders and shadows near the white ceiling.
- One accent per mode, and `accent-light` / `accent-dark` / `accent-ink` are
  aliases of it. Depth and hover come from the alpha ramp, which shares the hue.
  Three decorative purples used to coexist on the same screen and read as a
  mistake.
- Every text role must meet WCAG AA against its actual background in both
  modes.
- Alpha ramps and RGB channel values are derived by the generator, never copied
  into generated targets.

## Semantics

- `error` stays red because it communicates destructive or failed states.
- `local` uses the accent; `cloud` uses the neutral ramp so the distinction does
  not depend on two similar hues.
- Speaker colors are steps of the neutral ramp, deliberately not the accent, so
  a participant never reads as "active". Six greys separate worse than six hues,
  so a six-person meeting wants the speaker's initial alongside the grey.

## The pill

The native pill always uses the dark shell palette because it floats over the
desktop rather than an app theme. Its capture halo derives from the success
token.

## The current values

| | Dark | Light |
| --- | --- | --- |
| background | `#000000` | `#ffffff` |
| text | `#ffffff` | `#000000` |
| accent | `#7079fb` | `#5853fa` |
| error | `#ef4444` | `#b91c1c` |

The accent is chosen against the grounds it actually sits on — `bg-surface` and
`accent-10` chips — not against pure black and white. A single value for both
modes was tried (`#626bd5`); it cleared 4.58:1 on the two pure grounds and
failed on all three real ones.

## Changing the palette

Edit `palette.ts`, run the generator, then run its tests. Do not edit generated
targets directly.

The SVG brand assets (`assets/brand/looper-*.svg`) cannot read tokens, so their
two colors are mirrored in `BRAND_MARK`. If you change the mark, change both.

## Deliberate exceptions

These are decisions, not debt. Each one has a reason for staying outside the
token system:

- **Shadow recipes** in `foundation.css` (`--shadow-*`, `--ui-shadow-*`) keep
  their inline `rgba(0,0,0,…)`. The color is embedded in a composite value;
  extracting it fragments the recipe. Mobile's `shadowColor` *is* tokenized,
  because there it is a standalone color prop rather than a recipe.
- **Syntax highlighting** in `apps/web/src/app/tokens.css` (highlight.js token
  classes) is independent of the brand by design.
- **The setup banner** in `packages/ts/data/src/adapters/convex/provider.tsx`
  uses inline colors on purpose: it is what renders when the app fails to boot,
  so it must not depend on the design system that may be what failed to load.
- **Vendored Tailwind class names** in `apps/desktop/src/app/styles/utilities.css`
  keep their original names (`.text-red-400` now paints `--color-error`). The
  values are tokenized; renaming the ~80 call sites is separate work.
