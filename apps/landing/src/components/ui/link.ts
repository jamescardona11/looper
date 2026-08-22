/**
 * Muted text link.
 *
 * Three chunks arrived with three different hovers for the same shape of link:
 * the header darkened to the foreground, the footer went to #3f3ad8 (a second
 * purple that exists nowhere in the palette), and the competitor names in the
 * comparison table went to the accent. One behaviour now, used by all three.
 *
 * Foreground rather than accent: the design's global `a:hover` never actually
 * fires on these, because every one of them carries an inline colour that beats
 * it, so there is no approved hover to be faithful to. Darkening is the reading
 * that does not introduce a colour the page does not otherwise use.
 */
export const mutedLinkClass =
  "text-muted-foreground transition-colors duration-[160ms] hover:text-foreground focus-visible:rounded-sm focus-visible:outline-2 focus-visible:outline-primary focus-visible:outline-offset-2 motion-reduce:transition-none";
