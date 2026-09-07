import { useLandingCopy } from "../lib/landing-copy";
import { containerClass } from "../lib/layout";

/**
 * The band under the hero: where Looper runs today, and what is coming.
 * A row on desktop, a stack on mobile. No motion in either artboard.
 *
 * The tinted background is full bleed, so it sits on the <section> and the
 * shared gutters sit on the inner element.
 */

const PLATFORMS = ["macOS", "Windows", "Linux", "Web"];

export function PlatformStrip() {
  const copy = useLandingCopy();

  return (
    <section
      aria-label={copy.platform.label}
      className="border-border border-y bg-[var(--lp-lavender)]"
    >
      <div
        data-reveal
        className={`${containerClass} grid gap-4 py-6 md:grid-cols-[1fr_auto_auto] md:items-center md:gap-10 md:py-7`}
      >
        <p className="font-display font-semibold text-[18px] tracking-[-0.035em] md:text-[20px]">
          {copy.platform.title}
        </p>
        <ul className="flex list-none items-center gap-[22px] p-0 text-[14px] text-ink-secondary md:gap-7">
          {PLATFORMS.map((platform) => (
            <li key={platform}>{platform}</li>
          ))}
        </ul>
        <p className="text-[12px] text-ink-muted md:text-[13px]">{copy.platform.mobile}</p>
      </div>
    </section>
  );
}
