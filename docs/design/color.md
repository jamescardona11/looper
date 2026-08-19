# Color

Looper's palette is generated. There is exactly one place a color is written
(`packages/ts/config/src/palette.ts`) and one command that propagates it:

```bash
node tools/tokens/generate.mjs          # rewrite the three targets
node tools/tokens/generate.mjs --check  # fail if they drifted
```

`tools/tokens/generate.test.mjs` runs that check in CI, so a hand-edited token
file fails the build instead of silently diverging.

## Why this exists

The palette used to live in three hand-maintained copies. They drifted: web
neutrals sat on a green hue (145°) while desktop used a blue-grey (274°), both
under the same periwinkle accent. Nobody decided that; it accumulated. The
generator exists to make that failure impossible, not to be clever.

## Generated targets

| File | Surface |
| --- | --- |
| `apps/web/src/app/tokens.generated.css` | Web (Tailwind v4 / shadcn names) |
| `apps/desktop/src/app/styles/tokens.colors.generated.css` | Desktop (Tauri) |
| `apps/mobile/src/shared/theme/colors.ts` | Mobile (React Native) |

`foundation.css` keeps typography, shadows and radii — no colors. Mobile gets a
TypeScript object because React Native cannot read CSS variables.

## The rules

**One hue for everything.** `BRAND_HUE = 276.5` — the accent's own hue. Every
neutral uses it too, so the greyscale and the brand read as one family rather
than as two unrelated decisions. Before, the hue drifted 271→282 across the
ramp for no reason.

**Chroma follows lightness.** `neutralChroma(l) = 0.026 × min(l, 1−l) × 2`.
Tint peaks in the mid-greys and falls to nothing at the ends, so the darkest
black and the lightest white carry no cast. The old ramp had chroma rising
through the backgrounds (0.008 → 0.023) and then collapsing in the text
(0.016 → 0.004), which is why the greys looked unrelated to each other.

**Background steps stay 4–5 lightness points apart** in dark mode. The previous
ramp packed five surfaces into ten points, so `bg-secondary` and `bg-tertiary`
sat at 1.05:1 and 1.11:1 against the page — indistinguishable.

Light mode is the exception, and deliberately so: it runs into the 1.0 ceiling
with only ~4 points between the page and white. There, elevation is carried by
borders and shadows, and `bg-elevated` goes *down* rather than up. The test
encodes both floors (`{ dark: 0.03, light: 0.008 }`).

**The accent is two values, not one.** `#8f9cff` gives 2.3:1 on the light
background — unusable for text or borders. Light mode has its own lightness:

| Token | Dark | Light |
| --- | --- | --- |
| `--color-accent` | `#8f9cff` · 7.51:1 | — |
| `--color-accent-ink` | `#8f9cff` | `#5a62cb` · 4.64:1 |
| `--color-accent-solid` | `#6a74dc` | `#4e53c1` · white at 6.30:1 |

Use `accent` for fills and glows on dark. Use `accent-ink` for text and borders.
Use `accent-solid` when a filled button needs a white label.

**Every text role clears WCAG AA against its own background**, in both modes.
This is asserted, not assumed — `text-muted` was shipping at 4.30:1 in light
mode before this.

| | Dark on `#101116` | Light on `#f2f2f4` |
| --- | --- | --- |
| `text-primary` | `#f5f5f6` · 17.30:1 | `#202128` · 14.34:1 |
| `text-secondary` | `#bcbdc5` · 10.08:1 | `#4a4c59` · 7.61:1 |
| `text-muted` | `#8a8d99` · 5.70:1 | `#686b7a` · 4.73:1 |

**Derived values are computed, never copied.** Alpha ramps, and the loose RGB
channel triplets the canvas visualizers need (`--ui-pill-cleanup-rgb`,
`--ui-pill-dot-error-rgb`), come from the token. They used to be hand-written,
so changing the accent left the pill's cleanup effect on the old color.

## Semantics

`error` is the one color that cannot be replaced by an icon or a shape — it
carries safety meaning (delete, failed capture, lost transcript) and it is the
one signal a new user reads without learning anything. It stays red.

`local` and `cloud` no longer both carry color. They used to sit 20.5° apart and
read as the same thing at pill size. Now `local` **is** the accent — it is
Looper's preferred state — and `cloud` leans on the neutral ramp. "Has color vs
has no color" survives colour blindness, a 34px overlay, and a compressed
screenshot; two nearby hues do not.

**Speaker colors** avoid the accent band (250–305°) and the error band (5–45°)
on purpose. `speaker-1` used to sit at ΔE 3.2 from the accent and `speaker-5` at
6.2, so "who is talking" read like "active state". The six hues are spread over
the remaining arc and the test asserts ΔE > 12 from the accent and > 8 from each
other.

## The pill

The pill is a native overlay: it floats over the user's desktop, not over the
app. Its shell therefore uses the dark values in **both** themes, and that is
why `--ui-pill-shell-bg` reads from `PALETTE.dark` explicitly rather than from
the active mode.

The capture dot's halo derives from `--color-success` via `color-mix`. It used
to be pinned to the light-mode green, so in light mode the dot and its halo were
the same color and the halo silently disappeared.

## Changing the palette

Edit `palette.ts`, run the generator, run the tests. The accent is three
constants; the neutral ramp is one function. Do not edit a generated file — the
drift test will fail and the change will be overwritten on the next run.

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
