import { useLingui } from "@lingui/react/macro";
import {
  editionInfo,
  type LicenseEdition,
} from "../../../shared/lib/licenseEdition";
import type { PurchaseTier } from "../purchaseConfig";
import {
  CARD_DETAILS_HEIGHT_SLIM,
  CardDetailsGrid,
  CardDottedRule,
  useMemberCardPalette,
} from "./memberCardShared";
import { MemberCardCoverage } from "./member-card-coverage";
import { MEMBER_CARD_PLACEHOLDER } from "./member-card-model";
import { MemberCardStat } from "./member-card-stat";
import { MemberCardTierPicker } from "./member-card-tier-picker";
import type { CardRevealStage } from "./useCardActivationSequence";

type MemberCardDetailsProps = {
  active: boolean;
  edition: LicenseEdition;
  activeDevices: number | null;
  deviceLimit: number;
  memberSinceValue: string;
  wordsSpokenValue: string;
  showDetails: boolean;
  showCoverage: boolean;
  showTierPicker: boolean;
  showDraftChrome: boolean;
  cinematic: boolean;
  typingReveal: boolean;
  userReveal: boolean;
  stage: CardRevealStage;
  previewTier: PurchaseTier | null;
  openingTarget: PurchaseTier | null;
  tierDisabled: boolean;
  onPreviewTier: (tier: PurchaseTier) => void;
  onPurchaseTier: (tier: PurchaseTier) => void;
};

export const MemberCardDetails = (props: MemberCardDetailsProps) => {
  const { t } = useLingui();
  const colors = useMemberCardPalette();
  const coverageBase = editionInfo(props.edition).blurb;
  const coverage =
    props.activeDevices === null
      ? coverageBase
      : t({
          id: "member_card.coverage_with_devices",
          message: `${coverageBase} · ${props.activeDevices} of ${props.deviceLimit} devices active`,
        });
  let lowerContent = null;
  if (props.showTierPicker && props.showDraftChrome) {
    lowerContent = (
      <MemberCardTierPicker
        previewTier={props.previewTier}
        openingTarget={props.openingTarget}
        disabled={props.tierDisabled}
        onPreview={props.onPreviewTier}
        onPurchase={props.onPurchaseTier}
      />
    );
  } else if (props.showCoverage) {
    lowerContent = (
      <MemberCardCoverage
        text={coverage}
        animate={
          props.userReveal && props.typingReveal && props.stage === "coverage"
        }
      />
    );
  } else if (props.cinematic) {
    lowerContent = (
      <span
        aria-hidden="true"
        className="absolute inset-x-0 top-0 block font-mono"
        style={{ fontSize: "10px", color: colors.textDisabled, opacity: 0.3 }}
      >
        {MEMBER_CARD_PLACEHOLDER}
      </span>
    );
  }
  return (
    <CardDetailsGrid
      height={props.active ? undefined : CARD_DETAILS_HEIGHT_SLIM}
    >
      {props.active ? (
        <>
          <MemberCardStat
            label={t({
              id: "member_card.label_member_since",
              message: "Member since",
            })}
            value={props.memberSinceValue}
            show={props.showDetails}
          />
          <MemberCardStat
            label={t({
              id: "member_card.label_words_spoken",
              message: "Words spoken",
            })}
            value={props.wordsSpokenValue}
            show={props.showDetails}
            delaySec={0.12}
          />
        </>
      ) : null}
      <div className="relative col-span-2 shrink-0 pt-1">
        <CardDottedRule />
        <div className="relative mt-1.5 min-h-[28px]">{lowerContent}</div>
      </div>
    </CardDetailsGrid>
  );
};
