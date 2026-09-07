/**
 * Call-to-action surfaces.
 *
 * Several call-to-action controls exist on the page and, before assembly,
 * multiple implementations of the same button did too: hand-rolled hover/active
 * stacks that had already drifted (12px, 11px and 14px radii where the artboards
 * say 12, 11 and 12) plus a fourth in the header. The interaction is identical in
 * every artboard, so it lives once in `.lp-cta` in src/styles/index.css.
 *
 * Size, radius and padding stay at the call site: they genuinely differ per
 * artboard and folding them into a variant prop would mean four variants for four
 * uses, which is a lookup table wearing a component's clothes.
 */

const interactive =
  "focus-visible:outline-2 focus-visible:outline-primary focus-visible:outline-offset-2";

/**
 * Shared skeleton. Not exported: every button is one of the three below.
 *
 * The `inline-flex` here is unprefixed, and Tailwind emits `.inline-flex` AFTER
 * `.hidden`, so a plain `hidden` at a call site loses to it and the control stays
 * visible at every width. Hide one of these with `max-md:hidden` (a variant, so it
 * sorts after both), never with bare `hidden`.
 */
const base = `lp-cta inline-flex items-center justify-center font-medium whitespace-nowrap ${interactive}`;

/** The accent button. Hero, access, and the closing card. */
export const ctaPrimaryClass = `${base} bg-primary text-primary-foreground`;

/** The black button. Header only, where the accent would compete with the wordmark. */
export const ctaInkClass = `${base} bg-foreground text-background`;

/**
 * The outlined button beside the hero's primary. Uses `.lp-ghost` rather than
 * `.lp-cta`: the artboard gives it a border and background change, not a lift.
 */
export const ctaGhostClass = `lp-ghost inline-flex items-center justify-center border border-input font-medium whitespace-nowrap text-foreground ${interactive}`;
