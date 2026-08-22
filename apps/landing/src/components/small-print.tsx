import { containerClass } from "../lib/layout";

/*
 * The reveal and the hover lift are `.lp-reveal` and `.lp-lift` in
 * src/styles/index.css. This file used to carry private `small-print-reveal` and
 * `small-print-lift` copies of both.
 */

type SmallPrintCard = {
  readonly heading: string;
  readonly body: string;
};

/**
 * [LANGUAGE COUNT] is a deliberate hole. It stays bracketed until someone can
 * put a number in it that the transcription team will stand behind.
 */
const CARDS: readonly SmallPrintCard[] = [
  {
    heading: "The first run downloads a model.",
    body: "Once. After that Looper works with the network off, and a failed download resumes instead of starting over.",
  },
  {
    heading: "Cleanup is English first.",
    body: "Transcription handles [LANGUAGE COUNT] languages. The rewriting that fixes punctuation and filler is strongest in English today.",
  },
  {
    heading: "Phones come next.",
    body: "Desktop is ready on all three platforms. iPhone and Android are in the workshop, and sync is what will connect them.",
  },
];

/**
 * The three caveats, stated before anyone has to discover them.
 *
 * The mobile artboard has no equivalent of this section, so the approved design
 * settles the desktop layout only. Rather than drop the honesty from the small
 * screen, the cards stack in one column using the rhythm the rest of the mobile
 * page keeps: 20px gutters, 12px between cards, 22px inside them.
 */
export function SmallPrint() {
  return (
    <section className={`${containerClass} pb-12 md:pb-[104px]`}>
      <h2 className="lp-rise mb-3.5 text-[31px] leading-[1.06] tracking-[-0.045em] md:mb-9 md:max-w-[560px] md:text-[44px] md:leading-[1.04] md:tracking-tighter">
        The honest small print.
      </h2>

      <div className="lp-stagger grid gap-3 md:grid-cols-3 md:gap-5">
        {CARDS.map((card) => (
          <article
            key={card.heading}
            className="lp-lift flex flex-col gap-2.5 rounded-[14px] border border-border p-[22px] md:p-7"
          >
            <h3 className="text-[19px] leading-[1.2] tracking-tighter md:leading-[1.25]">
              {card.heading}
            </h3>
            <p className="text-[14px] text-muted-foreground leading-[1.6]">{card.body}</p>
          </article>
        ))}
      </div>
    </section>
  );
}
