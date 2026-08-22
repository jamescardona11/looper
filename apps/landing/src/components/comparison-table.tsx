import type { CSSProperties } from "react";
import { containerClass } from "../lib/layout";
import {
  CELL_STATE_LABEL,
  COMPARISON_REVIEW_DATE,
  COMPARISON_ROWS,
  COMPETITORS,
  type ComparisonCell,
} from "./comparison-data";
import { mutedLinkClass } from "./ui/link";

/*
 * The reveal is `.lp-reveal` in src/styles/index.css, shared with every other
 * section. This file used to carry a private `compare-reveal` copy of it.
 */

/**
 * The design derives the tinted Looper column from the accent, so we do too
 * rather than pasting a second literal: rgb(88 83 250) at 4.5% alpha.
 */
const TINT_STYLE = {
  "--compare-tint": "color-mix(in srgb, var(--brand) 4.5%, transparent)",
} as CSSProperties;

type MarkProps = { readonly className: string };

function CheckMark({ className }: MarkProps) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.4"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      <path d="M20 6 9 17l-5-5" />
    </svg>
  );
}

function CrossMark({ className }: MarkProps) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.4"
      strokeLinecap="round"
      aria-hidden="true"
      focusable="false"
    >
      <path d="M18 6 6 18" />
      <path d="m6 6 12 12" />
    </svg>
  );
}

/**
 * One verdict. The mark is decorative and the label beside it is what carries
 * the meaning, so nothing here reads by colour or by glyph alone.
 */
function VerdictMark({
  cell,
  isLooper,
}: {
  readonly cell: ComparisonCell;
  readonly isLooper: boolean;
}) {
  const size = isLooper ? "size-4 md:size-[17px]" : "size-3.5 md:size-[17px]";

  return (
    <>
      {cell.state === "confirmed" ? (
        <CheckMark className={isLooper ? `${size} text-primary` : `${size} text-ink-secondary`} />
      ) : null}
      {cell.state === "notOffered" ? <CrossMark className={`${size} text-ink-faint`} /> : null}
      {cell.state === "notAdvertised" ? (
        <span
          aria-hidden="true"
          className="font-mono text-[13px] text-ink-faint tracking-normal md:text-[15px]"
        >
          ?
        </span>
      ) : null}
      <span className="sr-only">{CELL_STATE_LABEL[cell.state]}</span>
    </>
  );
}

/**
 * Ten capabilities across five products.
 *
 * One table in the DOM, two layouts. Above 768px it is an ordinary six column
 * table, and the header row associates every mark with its product. Below 768px
 * the row becomes a card: the capability and the Looper verdict share a tinted
 * top band, and the four competitors sit in a row of four beneath.
 *
 * Switching a <tr> to grid does cost the table its row and cell roles in the
 * accessibility tree, so the narrow layout does not lean on them. Each cell
 * carries the competitor name as a real span, not generated content, and each
 * mark carries its verdict as text, so the card reads correctly as plain prose:
 * "Open source, Confirmed, AGPLv3, Wispr Flow, Not offered or limited, ...".
 * That is why the names are spans rather than a ::before with attr().
 */
export function ComparisonTable() {
  return (
    <section id="compare" style={TINT_STYLE} className={`${containerClass} py-12 md:py-[104px]`}>
      <div className="lp-reveal flex flex-col gap-3.5 md:mb-10 md:max-w-[640px] md:gap-4">
        <h2 className="text-[31px] leading-[1.06] tracking-[-0.045em] md:hidden">
          Where Looper sits among the tools you are weighing.
        </h2>
        <h2 className="hidden tracking-tighter md:block md:text-[44px] md:leading-[1.04]">
          Where Looper sits among the tools you are probably weighing.
        </h2>
        <p className="text-[15px] text-ink-secondary leading-[1.6] md:hidden">
          Two rows go against us, and they stay in. A comparison that wins everything is an
          advertisement.
        </p>
        <p className="hidden text-ink-secondary md:block md:text-[17px] md:leading-[1.6]">
          Two rows go against us, and they stay in. A comparison that wins everything is not a
          comparison, it is an advertisement.
        </p>
      </div>

      <div className="lp-reveal mt-2.5 overflow-hidden md:mt-0 md:rounded-[18px] md:border md:border-border">
        <table className="w-full max-md:block md:table-fixed">
          <caption className="sr-only">
            Looper compared with Wispr Flow, Granola, Humla and Meetily. Competitor entries reflect
            official pages reviewed {COMPARISON_REVIEW_DATE}.
          </caption>

          <colgroup>
            <col className="w-[27.54%]" />
            <col className="w-[14.49%]" />
            <col className="w-[14.49%]" />
            <col className="w-[14.49%]" />
            <col className="w-[14.49%]" />
            <col className="w-[14.49%]" />
          </colgroup>

          <thead className="max-md:hidden">
            <tr className="border-border border-b">
              <th
                scope="col"
                className="text-left font-normal text-[13px] text-ink-muted md:px-[26px] md:py-[22px]"
              >
                Capability
              </th>
              <th scope="col" className="bg-[var(--compare-tint)] text-center md:px-5 md:py-[22px]">
                <span className="font-display font-semibold text-[17px] text-primary tracking-[-0.03em]">
                  Looper
                </span>
              </th>
              {COMPETITORS.map((competitor) => (
                <th
                  key={competitor.name}
                  scope="col"
                  className="text-center font-normal md:px-5 md:py-[9px]"
                >
                  <a
                    href={competitor.url}
                    rel="noreferrer"
                    className={`${mutedLinkClass} inline-flex min-h-11 items-center justify-center px-2 text-[15px] text-ink-secondary`}
                  >
                    {competitor.name}
                  </a>
                </th>
              ))}
            </tr>
          </thead>

          <tbody className="max-md:flex max-md:flex-col max-md:gap-2.5">
            {COMPARISON_ROWS.map((row) => (
              <tr
                key={row.capability}
                className="lp-row max-md:grid max-md:grid-cols-4 max-md:overflow-hidden max-md:rounded-[12px] max-md:border max-md:border-border md:border-b md:border-b-[#f0f0f0]"
              >
                <th
                  scope="row"
                  className="px-4 py-3.5 text-left font-normal text-[14px] leading-[1.35] max-md:col-span-3 max-md:bg-[var(--compare-tint)] md:px-[26px] md:py-[18px] md:align-middle md:text-[15px]"
                >
                  {row.capability}
                </th>

                <td className="bg-[var(--compare-tint)] px-4 py-3.5 max-md:col-start-4 md:px-3 md:py-[18px] md:align-middle">
                  <div className="flex items-center justify-end gap-1.5 md:flex-col md:justify-center md:gap-[5px]">
                    <VerdictMark cell={row.looper} isLooper={true} />
                    {row.looper.note ? (
                      <span className="whitespace-nowrap font-mono text-[10px] text-ink-muted tracking-normal md:tracking-[0.02em]">
                        {row.looper.note}
                      </span>
                    ) : null}
                  </div>
                </td>

                {row.competitors.map((verdict) => (
                  <td
                    key={verdict.competitor.name}
                    className="px-1.5 py-3 max-md:border-[#f0f0f0] max-md:border-t md:px-3 md:py-[18px] md:align-middle"
                  >
                    <div className="flex flex-col items-center justify-center gap-1.5 md:gap-[5px]">
                      <span className="whitespace-nowrap text-[10px] text-ink-muted md:hidden">
                        {verdict.competitor.name}
                      </span>
                      <VerdictMark cell={verdict} isLooper={false} />
                      {verdict.note ? (
                        <span className="whitespace-nowrap font-mono text-[10px] text-ink-muted tracking-[0.02em] max-md:hidden">
                          {verdict.note}
                        </span>
                      ) : null}
                    </div>
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>

        <div className="hidden flex-wrap items-center gap-5 bg-muted px-[26px] py-[18px] md:flex">
          <span className="inline-flex items-center gap-[7px] text-[12px] text-ink-muted">
            <CheckMark className="size-[13px] text-ink-secondary" />
            Confirmed
          </span>
          <span className="inline-flex items-center gap-[7px] text-[12px] text-ink-muted">
            <CrossMark className="size-[13px] text-ink-faint" />
            Not offered or limited
          </span>
          <span className="inline-flex items-center gap-[7px] text-[12px] text-ink-muted">
            <span
              aria-hidden="true"
              className="font-mono text-[13px] text-ink-faint tracking-normal"
            >
              ?
            </span>
            Not advertised
          </span>
          <span className="text-[12px] text-ink-muted">
            Competitor entries reflect official pages reviewed {COMPARISON_REVIEW_DATE}. Plans and
            platforms can change.
          </span>
        </div>

        <p className="mt-1.5 text-[12px] text-ink-muted leading-[1.6] md:hidden">
          Confirmed, not offered, or not advertised. Competitor entries reflect official pages
          reviewed {COMPARISON_REVIEW_DATE}.
        </p>
      </div>
    </section>
  );
}
