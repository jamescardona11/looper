import type { ReactNode } from "react";
import { containerClass } from "../../lib/layout";

type MomentProps = {
  /** Offset into the recording, not a wall clock time, so no <time> element. */
  readonly at: string;
  readonly children: ReactNode;
  /** The Mobile artboard keeps two moments, the desktop one keeps three. */
  readonly desktopOnly?: boolean;
};

function Moment({ at, children, desktopOnly = false }: MomentProps) {
  return (
    <li className={`items-start gap-2.5 md:gap-3 ${desktopOnly ? "hidden md:flex" : "flex"}`}>
      <span className="mt-[3px] shrink-0 font-mono text-[10px] text-ink-muted tracking-normal md:text-[11px]">
        {at}
      </span>
      <span className="text-[13px] leading-[1.55] md:text-[14px]">{children}</span>
    </li>
  );
}

/**
 * Beat two: a full width centered band. This breaks the split rhythm on purpose,
 * so it stays a single centered column at every width and is never a grid.
 */
export function MeetingCapture() {
  return (
    <section
      aria-labelledby="meeting-capture-title"
      className={`${containerClass} lp-reveal flex flex-col items-center gap-[14px] py-8 text-center md:gap-[34px] md:py-14`}
    >
      <h2
        id="meeting-capture-title"
        className="text-[31px] leading-[1.06] tracking-[-0.045em] md:max-w-[700px] md:text-[44px] md:leading-[1.04] md:tracking-tighter"
      >
        Record a meeting without sending a bot to it.
      </h2>
      <p className="text-[15px] text-ink-secondary leading-[1.6] md:max-w-[520px] md:text-[17px]">
        Looper records from your computer's own audio. No guest appears in the participant list
        <span className="hidden md:inline">
          , and the notes are written from what was actually said
        </span>
        .
      </p>

      <figure className="mt-2 w-full max-w-[900px] overflow-hidden rounded-[14px] border text-left md:mt-0 md:rounded-[16px]">
        <figcaption className="sr-only">
          A Looper recording note for a meeting called Product sync, saved locally, showing
          timestamped lines and the moments captured from them.
        </figcaption>

        <div className="flex items-center justify-between gap-4 border-b bg-secondary px-4 py-[14px] md:px-[22px] md:py-4">
          <span className="font-display font-semibold text-[16px] tracking-[-0.03em] md:text-[17px]">
            Product sync
          </span>
          <span className="text-[11px] text-muted-foreground md:text-[12px]">Saved locally</span>
        </div>

        <div className="grid md:grid-cols-[1.4fr_1fr]">
          <ul className="flex flex-col gap-2.5 px-4 py-[18px] md:gap-[11px] md:border-r md:p-[22px]">
            <Moment at="08:42">Keep dictation and notes in separate libraries.</Moment>
            <Moment at="14:17">
              Calendar awareness is useful before a meeting, never a prerequisite.
            </Moment>
            <Moment at="22:03" desktopOnly>
              Nothing should block someone from reaching the product.
            </Moment>
          </ul>

          <aside className="hidden flex-col gap-3 bg-secondary p-[22px] md:flex">
            <p className="text-[12px] text-ink-muted">Captured moments</p>
            <div className="flex flex-col gap-2">
              <blockquote className="rounded-[9px] border bg-background px-3 py-2.5 text-[12px] text-ink-secondary leading-[1.5]">
                “Calendar awareness should come before a meeting starts.”
              </blockquote>
              <blockquote className="rounded-[9px] border bg-background px-3 py-2.5 text-[12px] text-ink-secondary leading-[1.5]">
                “We need visible proof that the model recovered.”
              </blockquote>
            </div>
          </aside>
        </div>
      </figure>
    </section>
  );
}
