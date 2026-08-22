/**
 * The competitor comparison matrix.
 *
 * Ported from the `renderVals()` block of the approved design component, which
 * encoded each verdict as a terse 'y' | 'n' | 'u' pair. The values themselves
 * are unchanged; only the encoding is, so that a reader of this file can tell
 * what a cell means without a legend.
 *
 * Two rows go against Looper on purpose ("Mobile app", "Broad app integrations"),
 * and a third is a cross with a note ("Sync across devices"). They stay in.
 */

/** Verdict for one product against one capability. */
export type CellState =
  /** Confirmed: the product does this today. */
  | "confirmed"
  /** Not offered, or offered in a form limited enough that it does not count. */
  | "notOffered"
  /** Not advertised anywhere we could check. Absence of evidence, not evidence of absence. */
  | "notAdvertised";

/** The only four qualifiers the matrix uses. Kept closed so a typo cannot slip in. */
export type CellNote = "Temporary" | "AGPLv3" | "Coming" | "Self-host";

export type ComparisonCell = {
  readonly state: CellState;
  readonly note?: CellNote;
};

export type Competitor = {
  readonly name: string;
  readonly url: string;
};

/** A competitor's verdict, carrying the competitor so the view never index-zips. */
export type CompetitorVerdict = ComparisonCell & {
  readonly competitor: Competitor;
};

export type ComparisonRow = {
  readonly capability: string;
  readonly looper: ComparisonCell;
  readonly competitors: readonly CompetitorVerdict[];
};

/**
 * Reads as the verdict legend, and is what a screen reader hears in place of the
 * check, the cross and the question mark. Every mark carries one of these, so no
 * cell depends on colour or shape alone.
 */
export const CELL_STATE_LABEL: Record<CellState, string> = {
  confirmed: "Confirmed",
  notOffered: "Not offered or limited",
  notAdvertised: "Not advertised",
};

/** The day every competitor claim below was read off an official page. */
export const COMPARISON_REVIEW_DATE = "August 18, 2026";

const WISPR_FLOW: Competitor = { name: "Wispr Flow", url: "https://wisprflow.ai/" };
const GRANOLA: Competitor = { name: "Granola", url: "https://www.granola.ai/" };
const HUMLA: Competitor = { name: "Humla", url: "https://humla.team/" };
const MEETILY: Competitor = { name: "Meetily", url: "https://meetily.ai/" };

/** Column order, left to right, after the Looper column. */
export const COMPETITORS: readonly Competitor[] = [WISPR_FLOW, GRANOLA, HUMLA, MEETILY];

const yes = (note?: CellNote): ComparisonCell => ({ state: "confirmed", note });
const no = (note?: CellNote): ComparisonCell => ({ state: "notOffered", note });
const unknown = (): ComparisonCell => ({ state: "notAdvertised" });

/** Positional tuple in COMPETITORS order. Destructured, never indexed. */
type CompetitorCells = readonly [ComparisonCell, ComparisonCell, ComparisonCell, ComparisonCell];

const row = (
  capability: string,
  looper: ComparisonCell,
  [wisprFlow, granola, humla, meetily]: CompetitorCells,
): ComparisonRow => ({
  capability,
  looper,
  competitors: [
    { ...wisprFlow, competitor: WISPR_FLOW },
    { ...granola, competitor: GRANOLA },
    { ...humla, competitor: HUMLA },
    { ...meetily, competitor: MEETILY },
  ],
});

export const COMPARISON_ROWS: readonly ComparisonRow[] = [
  row("Dictation in every app", yes(), [yes(), no(), no(), no()]),
  row("Bot-free meeting capture", yes(), [yes(), yes(), yes(), yes()]),
  row("Original recording available", yes(), [yes("Temporary"), unknown(), yes(), yes()]),
  row("Local transcription option", yes(), [unknown(), unknown(), yes(), yes()]),
  row("Bring your own AI key", yes(), [unknown(), unknown(), yes(), yes()]),
  row("Ask across recording history", yes(), [yes(), yes(), yes(), unknown()]),
  row("Open source", yes("AGPLv3"), [no(), no(), yes(), yes()]),
  row("Sync across devices", no("Coming"), [yes(), yes(), yes("Self-host"), unknown()]),
  row("Mobile app", no("Coming"), [yes(), yes(), no(), no()]),
  row("Broad app integrations", no(), [yes(), yes(), no(), no()]),
];
