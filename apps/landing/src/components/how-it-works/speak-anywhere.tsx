import type { ReactNode } from "react";
import { containerClass } from "../../lib/layout";

type DestinationProps = {
  /** The app or surface the dictation lands in. */
  readonly surface: string;
  /** How Looper writes for that surface. */
  readonly treatment: ReactNode;
  /** The Mobile artboard shows three destinations, the desktop one shows four. */
  readonly desktopOnly?: boolean;
};

function Destination({ surface, treatment, desktopOnly = false }: DestinationProps) {
  return (
    <div
      className={`lp-lift flex items-center justify-between gap-4 rounded-[11px] border px-[15px] py-[13px] md:rounded-[12px] md:px-[18px] md:py-[15px] ${
        desktopOnly ? "hidden md:flex" : "flex"
      }`}
    >
      <dt className="text-[14px] md:text-[15px]">{surface}</dt>
      <dd className="text-right font-mono text-[11px] text-muted-foreground tracking-normal md:text-[12px]">
        {treatment}
      </dd>
    </div>
  );
}

/**
 * Beat one: a split. Copy on the left, the list of destinations on the right.
 * Collapses to one column below md, where the design drops the fourth row and
 * shortens the first treatment.
 */
export function SpeakAnywhere() {
  return (
    <section
      id="how"
      aria-labelledby="speak-anywhere-title"
      className={`${containerClass} grid gap-[14px] pt-12 pb-8 md:grid-cols-2 md:items-center md:gap-[76px] md:pt-[104px] md:pb-14`}
    >
      <div className="lp-reveal flex flex-col gap-[14px] md:gap-[18px]">
        <h2
          id="speak-anywhere-title"
          className="text-[31px] leading-[1.06] tracking-[-0.045em] md:text-[44px] md:leading-[1.04] md:tracking-tighter"
        >
          Speak anywhere you already type.
        </h2>
        <p className="text-[15px] text-ink-secondary leading-[1.6] md:max-w-[430px] md:text-[17px]">
          Hold{" "}
          <kbd className="rounded-[5px] border bg-secondary px-1.5 py-px font-mono text-[13px] tracking-normal md:rounded-[6px] md:px-[7px] md:text-[15px]">
            fn
          </kbd>{" "}
          and talk. Looper writes into whatever has focus, and it knows that a prompt is not an
          email.
        </p>
      </div>

      <dl className="lp-reveal mt-2 flex flex-col gap-2 md:mt-0 md:gap-2.5">
        <Destination
          surface="Editor"
          treatment={
            <>
              code voice<span className="hidden md:inline">, no filler</span>
            </>
          }
        />
        <Destination surface="Chat with a model" treatment="kept as a prompt" />
        <Destination surface="Pull request" treatment="tidy and punctuated" desktopOnly />
        <Destination surface="Message to a colleague" treatment="plain and warm" />
      </dl>
    </section>
  );
}
