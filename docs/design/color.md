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

- Brand and neutral colors share one hue; neutral chroma falls toward black and
  white.
- Dark backgrounds retain visible lightness steps. Light elevation may rely on
  borders and shadows near the white ceiling.
- Use `accent` for fills/glows, `accent-ink` for text/borders, and
  `accent-solid` for filled controls with white labels.
- Every text role must meet WCAG AA against its actual background in both
  modes.
- Alpha ramps and RGB channel values are derived by the generator, never copied
  into generated targets.

## Semantics

- `error` stays red because it communicates destructive or failed states.
- `local` uses the accent; `cloud` uses the neutral ramp so the distinction does
  not depend on two similar hues.
- Speaker colors avoid the accent and error bands and maintain tested perceptual
  distance from one another.

## The pill

The native pill always uses the dark shell palette because it floats over the
desktop rather than an app theme. Its capture halo derives from the success
token.

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
