import { containerClass } from "../lib/layout";

/*
 * Roadmap rail. Desktop is a 200px status column beside the entry; mobile stacks
 * the status label above the title. The fourth entry is a deliberate placeholder
 * the design ships for a human to fill in or delete, so its bracketed strings are
 * verbatim and it never renders on mobile (the mobile artboard has three rows).
 */

/*
 * The reveal is `.lp-reveal` in src/styles/index.css, including its mobile
 * variant. All three files in this chunk used to ship the same stylesheet string
 * in a hoisted <style> tag.
 */

const entryClass =
  "flex flex-col gap-[7px] py-[22px] md:grid md:grid-cols-[200px_1fr] md:items-baseline md:gap-10 md:py-[30px]";
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
      className={`${containerClass} flex flex-col gap-3.5 pb-12 md:block md:pb-[104px]`}
      id="roadmap"
    >
      <div className="lp-rise md:mb-9 md:flex md:items-end md:justify-between md:gap-10">
        <h2
          className="text-[31px] leading-[1.06] tracking-[-0.045em] md:max-w-[520px] md:text-[44px] md:leading-[1.04] md:tracking-tighter"
          id="roadmap-title"
        >
          What we are building next.
        </h2>
        <span className="hidden whitespace-nowrap pb-2 text-ink-muted text-sm md:inline">
          Dated when it is real, not before
        </span>
      </div>

      <ul className="lp-stagger mt-2 border-border border-t md:mt-0">
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

        <li className={`${entryClass} hidden md:grid`}>
          <span className={`${statusClass} text-ink-faint`}>[STATUS]</span>
          <div className={bodyClass}>
            <h3 className={`${titleClass} text-ink-faint`}>[YOUR NEXT ROADMAP ITEM]</h3>
            <p className={`${proseClass} text-ink-faint`}>
              [One sentence on what it is and who it is for. Delete this row if three is the honest
              number.]
            </p>
          </div>
        </li>
      </ul>
    </section>
  );
}
