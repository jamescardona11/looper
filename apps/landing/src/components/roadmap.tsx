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
          What we are building next.
        </h2>
        <p className="text-[15px] text-ink-secondary leading-[1.65] md:text-[17px]">
          Dated when it is real, not before
        </p>
      </div>

      <ul data-reveal className="mt-2 border-border border-t md:mt-0">
        <li className={`${entryClass} border-border border-b`}>
          <span className={`${statusClass} text-primary`}>IN THE WORKSHOP</span>
          <div className={bodyClass}>
            <h3 className={titleClass}>iPhone and Android</h3>
            <p className={proseClass}>
              The same dictation and <span className="hidden md:inline">the same </span>recording
              notes, on the device you <span className="hidden md:inline">actually </span>carry to
              meetings.
            </p>
          </div>
        </li>

        <li className={`${entryClass} border-border border-b`}>
          <span className={`${statusClass} text-ink-muted`}>ARRIVES WITH MOBILE</span>
          <div className={bodyClass}>
            <h3 className={titleClass}>Sync across your devices</h3>
            <p className={`${proseClass} md:hidden`}>
              Dictate on your phone, find it on your desktop. The one feature that genuinely needs a
              server, so the one we will charge for.
            </p>
            <p className={`${proseClass} hidden md:block`}>
              Dictate on your phone, find it on your desktop. This is the one feature that genuinely
              needs a server, so it is the one we will charge for.
            </p>
          </div>
        </li>

        <li className={`${entryClass} border-border md:border-b`}>
          <span className={`${statusClass} text-ink-muted`}>BEING EXPLORED</span>
          <div className={bodyClass}>
            <h3 className={titleClass}>
              A cloud model for <span className="hidden md:inline">the </span>hard recordings
            </h3>
            <p className={proseClass}>
              Long, noisy, many voices at once. A paid switch
              <span className="hidden md:inline">
                {" "}
                for the cases where local is not the right tool
              </span>
              , off unless you turn it on.
            </p>
          </div>
        </li>
      </ul>
    </section>
  );
}
