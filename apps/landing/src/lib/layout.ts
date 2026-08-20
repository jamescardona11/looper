/**
 * The page's one horizontal rhythm.
 *
 * The artboards give two widths: 20px gutters at 390 and 140px gutters at 1440.
 * Written in parallel, the section chunks landed on two incompatible readings of
 * the gap between them — `md:px-[140px]` (jump to the full desktop gutter at
 * 768px, leaving 488px of content) and `md:px-10 xl:px-[140px]` (an intermediate
 * 40px step, full gutter only from 1280 up). The second is the one that holds at
 * 834 and 1024, so it is the one every section uses now.
 *
 * `max-w-[1440px]` caps the content at the artboard width and centres it, so a
 * 2560px monitor reproduces the 1440 design rather than stretching it. Sections
 * with a full-bleed background (the platform strip, the local-model band) put the
 * background on the <section> and this class on an inner element, so the colour
 * still runs edge to edge.
 */
export const containerClass = "mx-auto w-full max-w-[1440px] px-5 md:px-10 xl:px-[140px]";
