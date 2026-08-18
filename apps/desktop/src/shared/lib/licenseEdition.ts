import type { LicenseEdition, LicenseState } from "../types/license";

export type { LicenseEdition, LicenseState };

export type EditionInfo = {
  id: LicenseEdition;
  label: string;
  blurb: string;
};

type EditionDefinition = EditionInfo & {
  color: { fg: string; bg: string };
};

type EditionRow = readonly [id: LicenseEdition, label: string, blurb: string];

const EDITION_ROWS = [
  ["personal", "Personal", "For you. Up to 5 devices."],
  ["commercial", "Commercial", "For work. One person per seat, billed yearly."],
  ["founder", "Founder", "Launch founder. Up to 5 devices."],
  [
    "contributor",
    "Contributor",
    "Thank you for contributing. Up to 5 devices.",
  ],
] as const satisfies readonly EditionRow[];

const editionDefinition = ([
  id,
  label,
  blurb,
]: EditionRow): EditionDefinition => ({
  id,
  label,
  blurb,
  color: {
    fg: `var(--color-edition-${id})`,
    bg: `var(--surface-edition-${id})`,
  },
});

const EDITIONS = Object.fromEntries(
  EDITION_ROWS.map((row) => [row[0], editionDefinition(row)]),
) as Record<LicenseEdition, EditionDefinition>;

export const EDITION_COLORS = Object.fromEntries(
  Object.entries(EDITIONS).map(([id, definition]) => [id, definition.color]),
) as Record<LicenseEdition, EditionDefinition["color"]>;

export function editionInfo(edition: LicenseEdition): EditionInfo {
  const { id, label, blurb } = EDITIONS[edition];
  return { id, label, blurb };
}

export function editionFromLicenseState(
  licenseState: LicenseState | null,
  active: boolean,
): LicenseEdition {
  return active ? (licenseState?.edition ?? "personal") : "personal";
}
