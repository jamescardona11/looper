import { useLandingCopy } from "../lib/landing-copy";
import { containerClass } from "../lib/layout";

/** Roadmap rail with a status column on desktop and stacked entries on mobile. */

const entryClass =
  "flex flex-col gap-[7px] py-[22px] md:grid md:grid-cols-[220px_1fr] md:items-baseline md:gap-10 md:py-[30px]";
const statusClass = "font-mono text-[11px] tracking-[0.06em] md:text-xs";
const bodyClass = "flex flex-col gap-[7px] md:gap-2";
const titleClass =
  "text-[20px] leading-[1.2] tracking-[-0.045em] md:text-[24px] md:tracking-tighter";
const proseClass =
  "text-[14px] leading-[1.6] text-muted-foreground md:max-w-[620px] md:text-[15px]";

export function Roadmap() {
  const copy = useLandingCopy();

  return (
    <section
      aria-labelledby="roadmap-title"
      className={`${containerClass} flex flex-col gap-3.5 pb-16 md:block md:pb-28`}
      id="roadmap"
    >
      <div data-reveal className="mb-5 flex max-w-[660px] flex-col gap-4 md:mb-10">
        <h2
          className="text-[39px] leading-[0.98] tracking-[-0.05em] md:text-[58px]"
          id="roadmap-title"
        >
          {copy.roadmap.title}
        </h2>
        <p className="text-[15px] text-ink-secondary leading-[1.65] md:text-[17px]">
          {copy.roadmap.body}
        </p>
      </div>

      <ul data-reveal className="mt-2 border-border border-t md:mt-0">
        <li className={`${entryClass} border-border border-b`}>
          <span className={`${statusClass} text-primary`}>{copy.roadmap.workshop}</span>
          <div className={bodyClass}>
            <h3 className={titleClass}>{copy.roadmap.mobileTitle}</h3>
            <p className={proseClass}>{copy.roadmap.mobileBody}</p>
          </div>
        </li>

        <li className={`${entryClass} border-border border-b`}>
          <span className={`${statusClass} text-ink-muted`}>{copy.roadmap.withMobile}</span>
          <div className={bodyClass}>
            <h3 className={titleClass}>{copy.roadmap.syncTitle}</h3>
            <p className={proseClass}>{copy.roadmap.syncBody}</p>
          </div>
        </li>

        <li className={`${entryClass} border-border md:border-b`}>
          <span className={`${statusClass} text-ink-muted`}>{copy.roadmap.exploring}</span>
          <div className={bodyClass}>
            <h3 className={titleClass}>{copy.roadmap.cloudTitle}</h3>
            <p className={proseClass}>{copy.roadmap.cloudBody}</p>
          </div>
        </li>
      </ul>
    </section>
  );
}
