/*
 * "Choose where your voice runs": the page's one deliberate theme switch.
 *
 * The band does NOT hardcode a dark palette. It carries the repo's own `dark`
 * class, so packages/ts/config/src/palette.ts drives it through
 * tokens.generated.css exactly as it drives the desktop app. Five of the six
 * dark values the design asks for ARE the dark palette:
 *
 *   background #000000  card #0a0a0a  border #282828
 *   muted-foreground #868686  accent #7079fb  foreground #ffffff
 *
 * The two values that are NOT in the dark palette, #a8a8a8 for body copy on black
 * and #696969 for the inactive card, are now the --ink-secondary and --ink-faint
 * roles that src/styles/index.css redefines under `.dark`. So this band contains
 * no literal hex at all, and the same class names mean the right thing on both
 * surfaces.
 *
 * This is one section and only one. Nesting `dark` anywhere else would make the
 * switch a pattern instead of a statement.
 */

import { containerClass } from "../lib/layout";

/* Explicit px radii: index.css rebuilds the rounded-* scale from --radius, so
   rounded-xl resolves to 14px rather than the 12px this card needs. */
const modelCardClass =
  "flex items-center justify-between gap-4 rounded-[12px] bg-card px-[18px] py-4 " +
  "md:rounded-[14px] md:px-[22px] md:py-5";

export function LocalModel() {
  return (
    <section
      id="local"
      aria-labelledby="local-title"
      className="dark bg-background text-foreground"
    >
      <div
        className={`${containerClass} flex flex-col gap-4 py-[52px] md:grid md:grid-cols-2 md:items-center md:gap-[84px] md:py-[100px]`}
      >
        <div className="lp-reveal flex flex-col items-start gap-4 md:gap-[22px]">
          <p className="font-mono text-[11px] text-accent tracking-[0.06em] md:text-xs">
            THE PART OTHERS ONLY TALK ABOUT
          </p>
          <h2
            id="local-title"
            className="text-[31px] leading-[1.06] tracking-[-0.045em] md:text-[46px] md:leading-[1.04] md:tracking-tighter"
          >
            Choose where your voice runs.
          </h2>
          <p className="text-[15px] text-ink-secondary leading-[1.6] md:max-w-[440px] md:text-[17px]">
            Plenty of dictation apps promise privacy and still send your audio somewhere to be
            turned into text. Looper ships a speech model that runs on your own machine. Turn the
            network off and it keeps working.
          </p>
          {/* Mobile drops this paragraph and the shield note below. That is the
              approved design, not an oversight: the band earns its length on a
              1440 canvas and outstays it on a 390 one. */}
          <p className="hidden text-ink-secondary leading-[1.6] md:block md:max-w-[440px] md:text-[17px]">
            Cloud models stay available for the jobs that need them. It is a switch you own, not a
            default you inherit.
          </p>
        </div>

        <div className="lp-reveal mt-1.5 flex w-full flex-col gap-2.5 md:mt-0 md:gap-3">
          <div className={`${modelCardClass} border border-accent`}>
            <span className="flex flex-col gap-1 md:gap-[5px]">
              <span className="font-medium text-[15px] md:text-[16px]">Parakeet TDT V3</span>
              <span className="text-[12px] text-muted-foreground md:text-[13px]">
                Runs on this computer, works offline
              </span>
            </span>
            {/* The dot alone would be state carried by colour. The word rides
                along at every width and is merely visually hidden on mobile, so
                a screen reader always hears which model is running. */}
            <span className="inline-flex shrink-0 items-center gap-[7px] font-mono text-accent text-xs tracking-[0]">
              <span
                aria-hidden="true"
                className="h-[7px] w-[7px] shrink-0 rounded-full bg-accent"
              />
              <span className="sr-only md:not-sr-only">ACTIVE</span>
            </span>
          </div>

          <div className={`${modelCardClass} border border-border`}>
            <span className="flex flex-col gap-1 md:gap-[5px]">
              <span className="font-medium text-[15px] text-ink-secondary md:text-[16px]">
                Cloud model
              </span>
              <span className="text-[12px] text-ink-faint md:text-[13px]">
                Optional, for long or noisy recordings
              </span>
            </span>
            <span className="shrink-0 font-mono text-[11px] text-ink-faint tracking-[0] md:text-xs">
              OFF
            </span>
          </div>

          <div className="mt-2 hidden items-center gap-[11px] rounded-[12px] border border-border bg-card px-[18px] py-[15px] md:flex">
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={2}
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
              focusable="false"
              className="shrink-0 text-muted-foreground"
            >
              <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
            </svg>
            <p className="text-[13px] text-muted-foreground leading-[1.5]">
              Audio and transcripts are written to your own disk. Nothing is uploaded to train
              anything.
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}
