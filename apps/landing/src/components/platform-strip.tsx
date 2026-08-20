import { containerClass } from "../lib/layout";

/**
 * The band under the hero: where Looper runs today, and what is coming.
 * A row on desktop, a stack on mobile. No motion in either artboard.
 *
 * The tinted background is full bleed, so it sits on the <section> and the
 * shared gutters sit on the inner element.
 */

const PLATFORMS = ["macOS", "Windows", "Linux"];

export function PlatformStrip() {
  return (
    <section aria-label="Availability" className="border-border border-y bg-muted">
      <div
        className={`${containerClass} flex flex-col items-center gap-2.5 py-[22px] md:flex-row md:justify-center md:gap-11 md:py-[26px]`}
      >
        <p className="text-[12px] text-ink-muted md:text-[13px]">Available for</p>
        <ul className="flex list-none items-center gap-[22px] p-0 text-[15px] text-ink-secondary md:gap-8">
          {PLATFORMS.map((platform) => (
            <li key={platform}>{platform}</li>
          ))}
        </ul>
        <p className="text-[12px] text-ink-muted md:text-[13px]">iPhone and Android are next</p>
      </div>
    </section>
  );
}
