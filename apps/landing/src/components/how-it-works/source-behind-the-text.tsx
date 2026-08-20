import { containerClass } from "../../lib/layout";

const CARD_CLASS = "rounded-[11px] border px-4 py-[14px] md:rounded-[13px] md:px-5 md:py-[18px]";
const CARD_LABEL_CLASS = "mb-1.5 text-ink-muted text-[11px] md:mb-2 md:text-[12px]";
const PILL_CLASS =
  "lp-ghost inline-flex cursor-default items-center gap-[7px] rounded-full border px-[15px] py-2 text-ink-secondary text-[13px]";

/**
 * Beat three: the split from beat one, reversed. Evidence sits left of the copy
 * on desktop and below it on mobile, so the DOM keeps the reading order the
 * Mobile artboard uses and the desktop swap is done with grid order.
 *
 * The two pills are illustrations of controls in the product, not controls on
 * this page, so they stay spans: nothing here is clickable and nothing pretends
 * to be. The Mobile artboard drops them entirely.
 */
export function SourceBehindTheText() {
  return (
    <section
      aria-labelledby="source-behind-the-text-title"
      className={`${containerClass} grid gap-[14px] pt-8 pb-12 md:grid-cols-2 md:items-center md:gap-[76px] md:pt-14 md:pb-[104px]`}
    >
      <div className="lp-reveal flex flex-col gap-[14px] md:order-2 md:gap-[18px]">
        <h2
          id="source-behind-the-text-title"
          className="text-[31px] leading-[1.06] tracking-[-0.045em] md:text-[44px] md:leading-[1.04] md:tracking-tighter"
        >
          The source is always one <span className="md:hidden">tap</span>
          <span className="hidden md:inline">click</span> back.
        </h2>
        <p className="text-[15px] text-ink-secondary leading-[1.6] md:max-w-[430px] md:text-[17px]">
          Cleanup is an edit, not a replacement.{" "}
          <span className="md:hidden">
            Undo it, replay the audio, or send the raw text instead.
          </span>
          <span className="hidden md:inline">
            Every dictation keeps the words you actually said and the audio behind them, so you can
            undo the edit, replay it, or send the raw text instead.
          </span>
        </p>
      </div>

      <div className="lp-reveal mt-2 flex flex-col gap-2 md:order-1 md:mt-0 md:gap-2.5">
        <dl className="flex flex-col gap-2 md:gap-2.5">
          <div className={CARD_CLASS}>
            <dt className={CARD_LABEL_CLASS}>Cleaned</dt>
            <dd className="text-[14px] leading-[1.5] md:text-[15px] md:leading-[1.55]">
              The server was not receiving data.
              <span className="hidden md:inline"> I do not know whether it disconnected.</span>
            </dd>
          </div>
          <div className={`${CARD_CLASS} bg-secondary`}>
            <dt className={CARD_LABEL_CLASS}>What you said</dt>
            <dd className="text-[14px] text-ink-secondary leading-[1.5] md:text-[15px] md:leading-[1.55]">
              “for some reason the server, uh, was not receiving data
              <span className="hidden md:inline">. I don't know if it disconnected</span>”
            </dd>
          </div>
        </dl>

        <div className="mt-1 hidden gap-2 md:flex">
          <span className={PILL_CLASS}>
            <svg
              aria-hidden="true"
              focusable="false"
              width="13"
              height="13"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
            >
              <path d="M9 14 4 9l5-5" />
              <path d="M4 9h10a6 6 0 0 1 0 12h-3" />
            </svg>
            Undo cleanup
          </span>
          <span className={PILL_CLASS}>
            <svg
              aria-hidden="true"
              focusable="false"
              width="13"
              height="13"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="m6 3 14 9-14 9V3Z" />
            </svg>
            Play audio
          </span>
        </div>
      </div>
    </section>
  );
}
