import type { LicenseState } from "../../../data/license";
import { editionFromLicenseState } from "../../../shared/lib/licenseEdition";
import type { PurchaseTier } from "../../license/purchaseConfig";
import { formatCardDate } from "./member-card-geometry";
import type { CardRevealStage } from "./useCardActivationSequence";

export const MEMBER_CARD_PLACEHOLDER = "-";
export const DRAFT_CARD_SEED = "draft-looper";

export const memberCardIdentity = (
  licenseState: LicenseState | null,
  active: boolean,
) => {
  const email = licenseState?.customerEmail ?? null;
  const name = licenseState?.customerName?.trim() || null;
  const displayKey = licenseState?.displayKey ?? null;
  const memberSince = licenseState?.purchasedAt ?? licenseState?.activatedAt;
  return {
    email,
    name,
    displayKey,
    displayTitle: name || email,
    edition: editionFromLicenseState(licenseState, active),
    memberSinceValue: formatCardDate(memberSince) ?? MEMBER_CARD_PLACEHOLDER,
    activeDevices: licenseState?.activationsCount ?? null,
    deviceLimit: licenseState?.activationsLimit ?? 5,
    licenseReady: Boolean(active && displayKey && (name || email)),
  };
};

export type MemberCardVisualState = {
  previewTier: PurchaseTier | null;
  stripeSeed: string;
};

export const initialCardVisualState = (
  licenseState: LicenseState | null,
  active: boolean,
): MemberCardVisualState => ({
  previewTier: null,
  stripeSeed:
    active && licenseState?.displayKey
      ? licenseState.displayKey
      : DRAFT_CARD_SEED,
});

export const settleCardVisualState = (
  current: MemberCardVisualState,
  cinematic: boolean,
  stage: CardRevealStage,
  displayKey: string | null,
): MemberCardVisualState => {
  const previewTier = cinematic ? null : current.previewTier;
  const stripeSeed =
    stage === "draft"
      ? DRAFT_CARD_SEED
      : displayKey
        ? displayKey
        : current.stripeSeed;
  return previewTier === current.previewTier &&
    stripeSeed === current.stripeSeed
    ? current
    : { previewTier, stripeSeed };
};
