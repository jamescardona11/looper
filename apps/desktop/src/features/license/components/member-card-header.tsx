import { useLingui } from "@lingui/react/macro";
import { motion } from "framer-motion";
import type { HTMLMotionProps } from "framer-motion";
import type { ReactNode } from "react";
import type { LicenseEdition } from "../../../shared/lib/licenseEdition";
import { tierInfo, type PurchaseTier } from "../purchaseConfig";
import {
  CardHeaderRow,
  EDITION_STAMP_COLORS,
  STAMP_LAYER_CLASS,
  TIER_COLORS,
  TierStamp,
  useMemberCardPalette,
} from "./memberCardShared";

const revealEase = [0.34, 1.45, 0.64, 1] as const;
const previewMotion = {
  initial: { opacity: 0 },
  animate: { opacity: 1 },
  exit: { opacity: 0 },
  transition: { duration: 0.22, ease: "easeOut" },
} as const;
const slamMotion: Pick<
  HTMLMotionProps<"div">,
  "initial" | "animate" | "transition"
> = {
  initial: {
    opacity: 0,
    scale: 1.55,
    rotate: -18,
    y: -18,
    filter: "blur(1px)",
  },
  animate: {
    opacity: [0, 0.86, 1],
    scale: [1.55, 0.96, 1],
    rotate: [-18, 1.5, 0],
    y: [-18, 2, 0],
    filter: ["blur(1px)", "blur(0px)", "blur(0px)"],
  },
  transition: { duration: 0.42, times: [0, 0.62, 1], ease: revealEase },
};

const draftStampClass = [
  "absolute inset-x-0 flex justify-end",
  "font-mono uppercase tracking-[0.16em]",
].join(" ");

const editionMessage = (
  edition: LicenseEdition,
  t: ReturnType<typeof useLingui>["t"],
) => {
  if (edition === "commercial") {
    return t({ id: "member_card.tier_commercial", message: "Commercial" });
  }
  if (edition === "founder") {
    return t({ id: "member_card.tier_founder", message: "Founder" });
  }
  if (edition === "contributor") {
    return t({ id: "member_card.tier_contributor", message: "Contributor" });
  }
  return t({ id: "member_card.tier_personal", message: "Personal" });
};

const AnimatedTierStamp = ({
  label: caption,
  color: ink,
  bg: paper,
  playSlam: animated,
}: {
  label: string;
  color: string;
  bg: string;
  playSlam: boolean;
}) => {
  const stampProps = { label: caption, color: ink, bg: paper };
  if (!animated) {
    return (
      <div className={STAMP_LAYER_CLASS}>
        <TierStamp {...stampProps} />
      </div>
    );
  }
  return (
    <motion.div className={STAMP_LAYER_CLASS} {...slamMotion}>
      <TierStamp {...stampProps} />
    </motion.div>
  );
};

type MemberCardHeaderProps = {
  edition: LicenseEdition;
  displayKey: string | null;
  previewTier: PurchaseTier | null;
  showStamp: boolean;
  cinematic: boolean;
  userReveal: boolean;
  stampSlam: boolean;
};

export const MemberCardHeader = ({
  edition: licensedEdition,
  displayKey: keyText,
  previewTier: tierPreview,
  showStamp: stampVisible,
  cinematic: issuing,
  userReveal: requestedByUser,
  stampSlam: slam,
}: MemberCardHeaderProps) => {
  const { t } = useLingui();
  const palette = useMemberCardPalette();
  const preview = tierPreview ? tierInfo(tierPreview) : null;
  const previewColors = TIER_COLORS[tierPreview ?? "personal"];
  const editionColors = EDITION_STAMP_COLORS[licensedEdition];
  let stamp: ReactNode;
  if (stampVisible && keyText) {
    stamp = (
      <AnimatedTierStamp
        key={keyText}
        label={editionMessage(licensedEdition, t)}
        color={editionColors.fg}
        bg={editionColors.bg}
        playSlam={requestedByUser && slam}
      />
    );
  } else if (preview) {
    stamp = (
      <motion.div
        key={tierPreview}
        className={STAMP_LAYER_CLASS}
        {...previewMotion}
      >
        <TierStamp
          label={preview.label}
          color={previewColors.fg}
          bg={previewColors.bg}
        />
      </motion.div>
    );
  } else {
    stamp = (
      <span
        className={draftStampClass}
        style={Object.assign(
          { top: "-11px", fontSize: "10px", fontWeight: 700, lineHeight: 1.35 },
          {
            color: palette.textDisabled,
            textShadow: palette.wordmarkShadow,
            opacity: issuing ? 0.25 : 0.55,
          },
        )}
      >
        {issuing
          ? t({ id: "member_card.draft_stamp_issuing", message: "Issuing" })
          : t({ id: "member_card.draft_stamp_empty", message: "Unissued" })}
      </span>
    );
  }
  return (
    <CardHeaderRow
      price={preview?.price ?? null}
      priceColor={tierPreview ? previewColors.fg : undefined}
      stamp={stamp}
    />
  );
};
