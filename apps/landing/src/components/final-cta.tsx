import { useLandingCopy } from "../lib/landing-copy";
import { containerClass } from "../lib/layout";
import { desktopDownloadTarget, desktopDownloadUrl } from "../lib/links";
import { ctaInkClass } from "./ui/cta";

export function FinalCta() {
  const copy = useLandingCopy();

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
            {copy.finalCta.title}
          </h2>
          <p className="max-w-[560px] text-[16px] text-ink-secondary leading-[1.65] md:text-[18px]">
            {copy.finalCta.body}
          </p>
        </div>
        <a
          className={`${ctaInkClass} h-[52px] rounded-[12px] px-6 text-[15px]`}
          href={desktopDownloadUrl}
        >
          {copy.download[desktopDownloadTarget]}
        </a>
      </div>
    </section>
  );
}
