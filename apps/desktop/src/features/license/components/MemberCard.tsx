import { useLingui } from "@lingui/react/macro";
import { useState } from "react";
import type { LicenseState } from "../../../data/license";
import { useDictationStats } from "../queries";
import type { PurchaseTier } from "../../license/purchaseConfig";
import {
  getCardShellStyle,
  getMemberCardHeight,
  MemberCardFrame,
  MemberCardPaletteProvider,
  MemberCardPaperOverlays,
  MemberCardStripe,
  useMemberCardPalette,
} from "./memberCardShared";
import { MemberCardDetails } from "./member-card-details";
import { MemberCardHeader } from "./member-card-header";
import { MemberCardHeadline } from "./member-card-headline";
import {
  initialCardVisualState,
  memberCardIdentity,
  MEMBER_CARD_PLACEHOLDER,
  settleCardVisualState,
} from "./member-card-model";
import { useCardActivationSequence } from "./useCardActivationSequence";

export const PLACEHOLDER = MEMBER_CARD_PLACEHOLDER;
const memberCardClass = [
  "relative flex flex-col",
  "overflow-visible text-left",
].join(" ");

type MemberCardProps = {
  active: boolean;
  activating?: boolean;
  activationAttempt?: number;
  licenseLoading?: boolean;
  licenseState: LicenseState | null;
  openingTarget?: PurchaseTier | null;
  checkoutDisabled?: boolean;
  onOpenCheckout?: (tier: PurchaseTier) => void;
  onRevealComplete?: () => void;
};

const MemberCard = (props: MemberCardProps) => (
  <MemberCardPaletteProvider>
    <MemberCardContent {...props} />
  </MemberCardPaletteProvider>
);

const MemberCardContent = ({
  active: isLicensed,
  activating: requestInFlight = false,
  activationAttempt: requestNumber = 0,
  licenseLoading: loadingLicense = false,
  licenseState: license,
  openingTarget: checkoutTarget = null,
  checkoutDisabled: blockCheckout = false,
  onOpenCheckout: beginCheckout,
  onRevealComplete: finishReveal,
}: MemberCardProps) => {
  const { t } = useLingui();
  const palette = useMemberCardPalette();
  const [visualState, setVisualState] = useState(() =>
    initialCardVisualState(license, isLicensed),
  );
  const identity = memberCardIdentity(license, isLicensed);
  const stats = useDictationStats();
  const wordsSpokenValue =
    stats.data?.totalWords == null
      ? PLACEHOLDER
      : stats.data.totalWords.toLocaleString();
  const reveal = useCardActivationSequence(
    requestInFlight,
    isLicensed,
    identity.displayTitle,
    identity.licenseReady,
    loadingLicense,
    requestNumber,
    finishReveal,
  );
  const settledVisualState = settleCardVisualState(
    visualState,
    reveal.cinematic,
    reveal.stage,
    identity.displayKey,
  );
  if (settledVisualState !== visualState) setVisualState(settledVisualState);

  const licenseResolved = !loadingLicense || license !== null;
  const showDraftChrome =
    licenseResolved && !isLicensed && !reveal.cinematic && !requestInFlight;
  const purchaseDisabled =
    blockCheckout ||
    checkoutTarget !== null ||
    reveal.cinematic ||
    !showDraftChrome;
  const stripeTransition =
    reveal.isUserActivationReveal && reveal.cinematic && identity.displayKey
      ? ("sweep" as const)
      : ("none" as const);
  const openTier = (tier: PurchaseTier) => {
    if (purchaseDisabled || !beginCheckout) return;
    beginCheckout(tier);
  };

  return (
    <article
      className={memberCardClass}
      style={getCardShellStyle(palette)}
      aria-label={
        isLicensed
          ? t({ id: "member_card.aria", message: "Looper member card" })
          : t({
              id: "member_card.draft_aria",
              message: "Draft Looper member card",
            })
      }
    >
      <MemberCardPaperOverlays
        seedKey={settledVisualState.stripeSeed}
        cardHeight={getMemberCardHeight()}
      />
      <MemberCardFrame>
        <MemberCardHeader
          edition={identity.edition}
          displayKey={identity.displayKey}
          previewTier={settledVisualState.previewTier}
          showStamp={reveal.showStamp}
          cinematic={reveal.cinematic}
          userReveal={reveal.isUserActivationReveal}
          stampSlam={reveal.stampSlam}
        />
        <MemberCardHeadline
          active={isLicensed}
          cinematic={reveal.cinematic}
          typingReveal={reveal.typingReveal}
          showName={reveal.showName}
          showEmail={reveal.showEmail}
          displayTitle={identity.displayTitle}
          displayKey={identity.displayKey}
          name={identity.name}
          email={identity.email}
          previewTier={settledVisualState.previewTier}
        />
        <MemberCardDetails
          active={isLicensed}
          edition={identity.edition}
          activeDevices={identity.activeDevices}
          deviceLimit={identity.deviceLimit}
          memberSinceValue={identity.memberSinceValue}
          wordsSpokenValue={wordsSpokenValue}
          showDetails={reveal.showDetails}
          showCoverage={reveal.showCoverage}
          showTierPicker={reveal.showTierPicker}
          showDraftChrome={showDraftChrome}
          cinematic={reveal.cinematic}
          typingReveal={reveal.typingReveal}
          userReveal={reveal.isUserActivationReveal}
          stage={reveal.stage}
          previewTier={settledVisualState.previewTier}
          openingTarget={checkoutTarget}
          tierDisabled={purchaseDisabled}
          onPreviewTier={(tier) =>
            setVisualState((current) => ({ ...current, previewTier: tier }))
          }
          onPurchaseTier={openTier}
        />
        <MemberCardStripe
          seedKey={settledVisualState.stripeSeed}
          transitionMode={stripeTransition}
        />
      </MemberCardFrame>
    </article>
  );
};

export default MemberCard;
