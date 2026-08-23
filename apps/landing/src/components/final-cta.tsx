import { containerClass } from "../lib/layout";
import { desktopDownloadUrl } from "../lib/links";
import { ctaInkClass } from "./ui/cta";

export function FinalCta() {
  return (
    <section
      aria-labelledby="final-cta-title"
      className={`${containerClass} pb-16 md:pb-28`}
      id="download"
    >
      <div
        data-reveal
        className="grid gap-8 rounded-[24px] bg-[var(--lp-lavender)] p-6 md:grid-cols-[1fr_auto] md:items-end md:gap-14 md:rounded-[30px] md:p-10 lg:p-14"
      >
        <div className="flex max-w-[820px] flex-col gap-4">
          <h2
            className="text-[42px] leading-[0.96] tracking-[-0.055em] md:text-[66px]"
            id="final-cta-title"
          >
            Keep your voice close. Put it to work.
          </h2>
          <p className="max-w-[560px] text-[16px] text-ink-secondary leading-[1.65] md:text-[18px]">
            Choose the latest preview for macOS or Windows. Updates are verified by Looper, and
            operating-system signing will follow before general availability.
          </p>
        </div>
        <a
          className={`${ctaInkClass} h-[52px] rounded-[12px] px-6 text-[15px]`}
          href={desktopDownloadUrl}
        >
          Download Desktop
        </a>
      </div>
    </section>
  );
}
