import { containerClass } from "../lib/layout";
import { ctaPrimaryClass } from "./ui/cta";
import { DownloadIcon } from "./ui/icons";

/*
 * Closing call to action. One tinted card, centred, with the only download button
 * below the fold. The button on mobile is a full-width 52px bar with no icon, which
 * is what the mobile artboard asks for and what a thumb wants.
 *
 * [DOWNLOAD SIZE] is a deliberate hole left by the design for a human to fill.
 * href="#download" is the artboard's own placeholder: there is no release URL yet.
 */

/*
 * The reveal is `.lp-reveal` in src/styles/index.css, including its mobile
 * variant. All three files in this chunk used to ship the same stylesheet string
 * in a hoisted <style> tag.
 */

export function FinalCta() {
  return (
    <section
      aria-labelledby="final-cta-title"
      className={`${containerClass} pb-12 md:pb-[112px]`}
      id="download"
    >
      <div className="lp-reveal flex flex-col items-center gap-[18px] rounded-[18px] border border-border bg-muted px-6 py-11 text-center md:gap-6 md:rounded-[20px] md:px-12 md:py-[78px]">
        <h2
          className="text-[31px] leading-[1.05] tracking-[-0.045em] md:max-w-[600px] md:text-[52px] md:leading-[1.02] md:tracking-tighter"
          id="final-cta-title"
        >
          Say it once. Keep the useful part.
        </h2>
        <p className="text-[15px] text-ink-secondary leading-[1.55] md:max-w-[440px] md:text-[18px]">
          Install it, hold the key, and see what your own words look like when they land finished.
        </p>
        <a
          className={`${ctaPrimaryClass} h-[52px] w-full gap-2.5 rounded-[12px] text-[16px] md:mt-1 md:w-auto md:px-[30px]`}
          href="#download"
        >
          <DownloadIcon size={17} className="hidden md:block" />
          Download Looper
        </a>
        <p className="text-[12px] text-ink-muted md:text-[13px]">
          Free on macOS, Windows and Linux
          <span className="hidden md:inline">. [DOWNLOAD SIZE]</span>
        </p>
      </div>
    </section>
  );
}
