import { containerClass } from "../lib/layout";
import { ctaPrimaryClass } from "./ui/cta";

/*
 * Pricing. Three columns on desktop, one stack on mobile. Local is the only tier
 * that is buyable today, so it is the only one with an accent border and a button;
 * the other two carry a price of "Later" and a plain note instead of a control.
 *
 * The artboards give 390 and 1440 only. Between 768 and 1024 three columns of
 * 233px with 34px of padding read as cramped, so the row splits into three at lg
 * and stays a stack below it. That band is an interpolation, not a design fact.
 *
 * The three cards are written out rather than mapped because they differ in border,
 * background, price colour, footer element and copy. A data array plus four flags
 * would be longer than the markup it replaced.
 */

/*
 * The reveal is `.lp-reveal` in src/styles/index.css, including its mobile
 * variant. All three files in this chunk used to ship the same stylesheet string
 * in a hoisted <style> tag.
 */

const ctaClass = `${ctaPrimaryClass} mt-auto h-12 w-full gap-[9px] rounded-[11px] text-[15px]`;

/* 18px, not `rounded-2xl`: index.css rebuilds that step from --radius to 18px by
   coincidence today, but the design says 18 and the coincidence is not a contract. */
const cardClass =
  "flex flex-col gap-3 rounded-[18px] border px-[22px] py-6 lg:gap-4 lg:px-8 lg:py-[34px]";
const tierClass = "font-sans text-[13px] font-normal text-muted-foreground md:text-sm";
const priceClass =
  "font-display text-[36px] font-semibold leading-none tracking-tighter md:text-[44px]";
const proseClass = "text-[14px] leading-[1.6] text-muted-foreground";
const noteClass = "mt-auto hidden text-[13px] text-ink-muted md:block";

export function Pricing() {
  return (
    <section
      aria-labelledby="pricing-title"
      className={`${containerClass} flex flex-col gap-3.5 pb-12 md:block md:pb-[104px]`}
      id="pricing"
    >
      <div className="lp-rise flex flex-col gap-3.5 md:mb-9 md:max-w-[620px] md:gap-4">
        <span className="font-mono text-[11px] text-primary tracking-[0.06em] md:text-xs">
          PRICING
        </span>
        <h2
          className="text-[31px] leading-[1.06] tracking-[-0.045em] md:text-[44px] md:leading-[1.04] md:tracking-tighter"
          id="pricing-title"
        >
          Free where it runs on your own hardware.
        </h2>
        <p className="text-[15px] text-ink-secondary leading-[1.6] md:text-[17px]">
          <span className="md:hidden">No</span>
          <span className="hidden md:inline">There is no</span> word cap on the local model, because
          there is no server counting.
          <span className="hidden md:inline">
            {" "}
            You pay only for the things that genuinely cost us a machine somewhere.
          </span>
        </p>
      </div>

      <ul className="lp-stagger mt-2.5 flex flex-col gap-3 md:mt-0 lg:grid lg:grid-cols-3 lg:items-stretch lg:gap-5">
        <li className={`${cardClass} border-primary`}>
          <h3 className={tierClass}>Local</h3>
          <p className={priceClass}>Free</p>
          <p className={proseClass}>
            Unlimited dictation<span className="hidden md:inline"> on the local model</span>,
            recording notes, dictionary<span className="hidden md:inline">, snippets</span> and
            cleanup. On macOS, Windows and Linux.
          </p>
          <a className={ctaClass} href="#download">
            Download Looper
          </a>
        </li>

        <li className={`${cardClass} border-border bg-muted`}>
          <h3 className={tierClass}>Cloud model</h3>
          <p className={`${priceClass} text-ink-secondary`}>Later</p>
          <p className={`${proseClass} md:hidden`}>
            A paid switch for long or difficult recordings. Not part of the launch.
          </p>
          <p className={`${proseClass} hidden md:block`}>
            A paid switch for long or difficult recordings and the sharper cleanup models. Off by
            default, and off is a perfectly good place to leave it.
          </p>
          <p className={noteClass}>Not part of the launch.</p>
        </li>

        <li className={`${cardClass} border-border bg-muted`}>
          <h3 className={tierClass}>Sync across devices</h3>
          <p className={`${priceClass} text-ink-secondary`}>Later</p>
          <p className={`${proseClass} md:hidden`}>
            Paid, once phones arrive. It is the part that genuinely needs a server.
          </p>
          <p className={`${proseClass} hidden md:block`}>
            Paid, once phones arrive. Keeping your dictations and notes on every device is the one
            feature that genuinely needs a server, so it is the one we will charge for.
          </p>
          <p className={noteClass}>Ships with mobile.</p>
        </li>
      </ul>
    </section>
  );
}
