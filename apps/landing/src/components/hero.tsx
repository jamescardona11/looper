import { containerClass } from "../lib/layout";
import { desktopDownloadUrl } from "../lib/links";
import { CapturePillPreview } from "./ui/capture-pill-preview";
import { ctaGhostClass, ctaPrimaryClass } from "./ui/cta";

/** The product promise beside a real capture of the Purple desktop workspace. */

export function Hero() {
  return (
    <section
      id="top"
      className={`${containerClass} grid min-h-[calc(100dvh-68px)] gap-10 pt-10 pb-12 md:grid-cols-[0.82fr_1.18fr] md:items-center md:gap-10 md:pt-12 md:pb-16 xl:gap-16`}
    >
      <div className="flex flex-col items-start gap-5 md:gap-6">
        <p
          className="lp-enter font-mono text-[11px] text-primary tracking-[0.08em] md:text-[12px]"
          style={{ animationDelay: ".04s" }}
        >
          VOICE WORKSPACE FOR DESKTOP
        </p>

        <h1
          className="lp-enter max-w-[720px] text-[46px] leading-[0.98] tracking-[-0.055em] md:text-[clamp(56px,5.3vw,76px)] md:leading-[0.94]"
          style={{ animationDelay: ".1s" }}
        >
          Your voice becomes work.
        </h1>

        <p
          className="lp-enter max-w-[540px] text-[17px] text-ink-secondary leading-[1.55] md:text-[19px]"
          style={{ animationDelay: ".18s" }}
        >
          Dictate anywhere, capture meetings, and keep original audio beside the finished note.
          Local by default.
        </p>

        <div
          className="lp-enter flex w-full flex-col items-stretch gap-3.5 md:mt-1 md:w-auto md:flex-row md:items-center"
          style={{ animationDelay: ".26s" }}
        >
          <a
            href={desktopDownloadUrl}
            className={`${ctaPrimaryClass} h-[52px] rounded-[12px] px-6 text-[16px]`}
          >
            Download Desktop
          </a>

          <a
            href="#how"
            className={`${ctaGhostClass} h-[52px] rounded-[12px] px-[22px] text-[16px] max-md:hidden`}
          >
            See how Looper works
          </a>
        </div>
      </div>

      <figure className="lp-enter m-0" style={{ animationDelay: ".3s" }}>
        <div className="lp-product-stage">
          <div className="lp-product-frame overflow-hidden rounded-[20px] md:rounded-[28px]">
            <img
              src="/looper-workspace-purple.png"
              alt="Looper desktop workspace showing local dictation, recent recoverable history and a meeting ready to prepare"
              width="1350"
              height="830"
              fetchPriority="high"
              className="block h-auto w-full rounded-[14px] md:rounded-[21px]"
            />
          </div>
          <CapturePillPreview />
        </div>
        <figcaption className="mt-3 max-w-[620px] text-[12px] text-ink-muted leading-[1.55] md:ml-5 md:text-[13px]">
          One workspace for dictation, notes, memory and the local model that powers them.
        </figcaption>
      </figure>
    </section>
  );
}
