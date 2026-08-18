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

const EDITIONS: Record<LicenseEdition, EditionDefinition> = {
  personal: {
    id: "personal",
    label: "Personal",
    blurb: "For you. Up to 5 devices.",
    color: {
      fg: "var(--color-edition-personal)",
      bg: "var(--surface-edition-personal)",
    },
  },
  commercial: {
    id: "commercial",
    label: "Commercial",
    blurb: "For work. One person per seat, billed yearly.",
    color: {
      fg: "var(--color-edition-commercial)",
      bg: "var(--surface-edition-commercial)",
    },
  },
  founder: {
    id: "founder",
    label: "Founder",
    blurb: "Launch founder. Up to 5 devices.",
    color: {
      fg: "var(--color-edition-founder)",
      bg: "var(--surface-edition-founder)",
    },
  },
  contributor: {
    id: "contributor",
    label: "Contributor",
    blurb: "Thank you for contributing. Up to 5 devices.",
    color: {
      fg: "var(--color-edition-contributor)",
      bg: "var(--surface-edition-contributor)",
    },
  },
};

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
