import { containerClass } from "../lib/layout";
import { ctaGhostClass, ctaPrimaryClass } from "./ui/cta";
import { DownloadIcon } from "./ui/icons";

/**
 * Hero: the promise, the two calls to action, and the product frame.
 *
 * The frame is a composition placeholder, not a screenshot.
 * TODO: replace with a real capture of Looper writing into an editor,
 * 1120x760 @2x on desktop and 700x460 @2x on mobile.
 *
 * The headline is fluid above md. A 74px headline in a two-column hero visibly
 * collides with the product frame at 834px, so the two artboard values are
 * interpolated between and the clamp hits exactly 74px at 1440. Both endpoints
 * are approved sizes; nothing between them is invented.
 */

const WAVEFORM_DELAYS = ["0s", ".12s", ".24s", ".36s", ".48s"];

export function Hero() {
  return (
    <section
      id="top"
      className={`${containerClass} grid gap-9 pt-10 pb-11 md:grid-cols-[1.02fr_1fr] md:items-center md:gap-[76px] md:pt-[92px] md:pb-[88px]`}
    >
      <div className="flex flex-col items-start gap-5 md:gap-[26px]">
        <p
          className="lp-enter inline-flex items-center rounded-full border border-border px-[13px] py-1.5 text-[12px] text-muted-foreground md:px-[15px] md:py-[7px] md:text-[13px]"
          style={{ animationDelay: ".04s" }}
        >
          Dictation and recording notes
        </p>

        <h1
          className="lp-enter text-[41px] leading-none tracking-[-0.045em] md:text-[clamp(41px,5.2vw,74px)] md:leading-[0.96] md:tracking-tighter"
          style={{ animationDelay: ".1s" }}
        >
          Your voice never leaves your computer.
        </h1>

        <p
          className="lp-enter text-[17px] text-ink-secondary leading-[1.5] md:max-w-[470px] md:text-[20px]"
          style={{ animationDelay: ".18s" }}
        >
          Speech becomes finished text and recording notes, with the model running on your own
          hardware.
          <span className="hidden md:inline"> Nothing is uploaded to be transcribed.</span>
        </p>

        <div
          className="lp-enter flex w-full flex-col items-stretch gap-3.5 md:mt-1 md:w-auto md:flex-row md:items-center"
          style={{ animationDelay: ".26s" }}
        >
          <a
            href="#download"
            className={`${ctaPrimaryClass} h-[52px] gap-2.5 rounded-[12px] text-[16px] md:h-auto md:px-[26px] md:py-[15px]`}
          >
            <DownloadIcon size={17} />
            Download Looper
          </a>

          <a
            href="#how"
            className={`${ctaGhostClass} gap-2 rounded-[12px] px-[22px] py-3.5 text-[16px] max-md:hidden`}
          >
            See how it works
          </a>
        </div>
      </div>

      <figure
        className="lp-enter lp-parallax relative m-0 overflow-hidden rounded-[16px] border border-border shadow-[0_20px_44px_-22px_rgba(0,0,0,.22)] md:overflow-visible md:rounded-[18px] md:shadow-[0_34px_68px_-30px_rgba(0,0,0,.24)]"
        style={{ animationDelay: ".3s" }}
      >
        <figcaption className="sr-only">
          Looper turning a spoken sentence into a finished commit message, with the words you
          actually said kept underneath.
        </figcaption>

        <div className="flex items-center gap-[7px] rounded-t-[16px] border-border border-b bg-muted px-3.5 py-3 md:gap-2 md:rounded-t-[18px] md:px-4 md:py-3.5">
          <span className="size-[9px] rounded-full bg-border md:size-[11px]" />
          <span className="size-[9px] rounded-full bg-border md:size-[11px]" />
          <span className="size-[9px] rounded-full bg-border md:size-[11px]" />
          <span className="ml-2 text-[11px] text-ink-muted md:ml-2.5 md:text-[12px]">
            Commit message
          </span>
        </div>

        {/* 316, not the artboard's 250: the design has no CSS reset, so its
            `min-height: 250px` is 250px of CONTENT under content-box. Tailwind's
            preflight makes this border-box, where the same 250 would swallow the
            30px + 36px padding and leave the frame 63px shorter than the artboard. */}
        <div className="flex flex-col gap-3.5 bg-background px-[18px] pt-5 pb-6 md:min-h-[316px] md:gap-[18px] md:px-[26px] md:pt-[30px] md:pb-9">
          <p className="font-mono text-[13px] leading-[1.65] tracking-normal md:text-[14px] md:leading-[1.7]">
            {"fix(pill): remember where a drag that began"}
            <br className="hidden md:inline" />
            {" on a control left the pill"}
          </p>

          <div className="h-px bg-border" />

          <div className="flex items-start gap-2.5">
            <svg
              aria-hidden="true"
              focusable="false"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              className="hidden size-4 shrink-0 text-ink-muted md:mt-[3px] md:block"
            >
              <path d="M9 14 4 9l5-5" />
              <path d="M4 9h10a6 6 0 0 1 0 12h-3" />
            </svg>
            <p className="text-[12px] text-ink-muted leading-[1.6] md:text-[13px]">
              “ok so the fix is, um, the pill should remember where the drag left it
              <span className="hidden md:inline"> even if you started on a control</span>”
            </p>
          </div>
        </div>

        {/* Dark island: `dark` re-declares the brand tokens for this subtree, which is
            how the pill gets its #7079fb waveform on black without a hardcoded hex. */}
        <div className="dark flex items-center justify-center gap-2.5 bg-background p-[13px] md:absolute md:-bottom-[26px] md:left-1/2 md:-translate-x-1/2 md:gap-3 md:rounded-full md:px-5 md:py-3 md:shadow-[0_16px_34px_-12px_rgba(0,0,0,.45)]">
          <span aria-hidden="true" className="flex h-5 items-center gap-[3px] md:h-[22px]">
            {WAVEFORM_DELAYS.map((delay, index) => (
              <span
                key={delay}
                style={{ animationDelay: delay }}
                className={`lp-bar h-[18px] w-[3px] rounded-[2px] bg-primary md:h-5 ${
                  index === 4 ? "hidden md:block" : ""
                }`}
              />
            ))}
          </span>
          <span className="whitespace-nowrap font-medium text-[12px] text-foreground md:text-[13px]">
            Listening
          </span>
          <span className="whitespace-nowrap font-mono text-[11px] text-muted-foreground tracking-normal md:text-[12px]">
            hold fn
          </span>
        </div>
      </figure>
    </section>
  );
}
