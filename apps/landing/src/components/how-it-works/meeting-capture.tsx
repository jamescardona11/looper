import { containerClass } from "../../lib/layout";

export function MeetingCapture() {
  return (
    <section aria-labelledby="meeting-capture-title" className={`${containerClass} pb-16 md:pb-28`}>
      <div data-reveal className="flex max-w-[760px] flex-col gap-4">
        <h2
          id="meeting-capture-title"
          className="text-[39px] leading-[0.98] tracking-[-0.05em] md:text-[58px]"
        >
          A meeting becomes a note, not a pile of output.
        </h2>
        <p className="max-w-[620px] text-[16px] text-ink-secondary leading-[1.65] md:text-[18px]">
          Capture from your computer audio. Review the note, jump to a moment, or ask a question
          with the original recording still attached.
        </p>
      </div>

      <figure data-reveal className="mt-9 md:mt-12">
        <div className="lp-product-frame overflow-hidden rounded-[20px] md:rounded-[28px]">
          <img
            src="/looper-note-detail-purple.png"
            alt="Looper meeting note with the original audio rail, note, moments, transcript and summarization controls"
            width="1350"
            height="830"
            loading="lazy"
            className="block h-auto w-full rounded-[14px] md:rounded-[21px]"
          />
        </div>
        <figcaption className="mt-3 max-w-[700px] text-[12px] text-ink-muted leading-[1.55] md:ml-5 md:text-[13px]">
          The note stays editable. The audio stays reachable. Every answer can cite the exact
          minute.
        </figcaption>
      </figure>
    </section>
  );
}
