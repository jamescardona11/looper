import { useLingui } from "@lingui/react/macro";
import { motion } from "framer-motion";
import type { CSSProperties, ReactNode } from "react";
import { TypewriterText } from "../../../shared/ui/TypewriterText";
import { tierInfo, type PurchaseTier } from "../purchaseConfig";
import {
  CARD_HEADLINE_HEIGHT_EXPANDED,
  CARD_TITLE_FONT,
  CardHeadlineBlock,
  useMemberCardPalette,
} from "./memberCardShared";
import { MEMBER_CARD_PLACEHOLDER } from "./member-card-model";
import { REVEAL_NAME_SPEED_MS } from "./useCardActivationSequence";

type MemberCardHeadlineProps = {
  active: boolean;
  cinematic: boolean;
  typingReveal: boolean;
  showName: boolean;
  showEmail: boolean;
  displayTitle: string | null;
  displayKey: string | null;
  name: string | null;
  email: string | null;
  previewTier: PurchaseTier | null;
};

const titleClass = ["font-bold", "tracking-[-0.02em]", "break-words"].join(" ");
const titleMetrics = {
  fontFamily: CARD_TITLE_FONT,
  fontSize: "1.625rem",
  lineHeight: 1.35,
  margin: 0,
} as const;
const emailTitleMetrics = { fontSize: "1.25rem", lineHeight: 1.15 } as const;
const subtitleMetrics = {
  fontSize: "13px",
  fontWeight: 500,
  lineHeight: 1.35,
  margin: 0,
} as const;

export const MemberCardHeadline = (props: MemberCardHeadlineProps) => {
  const { t } = useLingui();
  const colors = useMemberCardPalette();
  const preview = props.previewTier ? tierInfo(props.previewTier) : null;
  const hasVisibleTitle = props.showName && props.displayTitle;
  const titleStyle: CSSProperties = {
    ...titleMetrics,
    color:
      hasVisibleTitle || preview ? colors.textPrimary : colors.textDisabled,
  };
  const subtitleStyle: CSSProperties = {
    ...subtitleMetrics,
    color: colors.textDisabled,
  };
  const renderedTitle = memberTitle(
    props,
    preview?.label,
    titleStyle,
    t,
    colors.textDisabled,
  );
  const renderedSubtitle = memberSubtitle(props, preview?.blurb, subtitleStyle);
  return (
    <CardHeadlineBlock
      height={props.active ? undefined : CARD_HEADLINE_HEIGHT_EXPANDED}
      title={renderedTitle}
      subtitle={renderedSubtitle}
    />
  );
};

const memberTitle = (
  props: MemberCardHeadlineProps,
  previewLabel: string | undefined,
  style: CSSProperties,
  t: ReturnType<typeof useLingui>["t"],
  disabledColor: string,
): ReactNode => {
  const emailSizing =
    props.displayTitle === props.email ? emailTitleMetrics : {};
  const resolvedStyle = { ...style, ...emailSizing };
  if (props.showName && props.displayTitle) {
    return props.typingReveal ? (
      <TypewriterText
        key={`reveal-name-${props.displayKey}`}
        text={props.displayTitle}
        as="h2"
        className={titleClass}
        style={resolvedStyle}
        speedMs={REVEAL_NAME_SPEED_MS}
      />
    ) : (
      <h2 className={titleClass} style={resolvedStyle}>
        {props.displayTitle}
      </h2>
    );
  }
  if (props.cinematic) {
    return (
      <motion.h2
        className={titleClass}
        style={{ ...style, color: disabledColor, opacity: 0.35 }}
        initial={{ opacity: 0.55 }}
        animate={{ opacity: 0.35 }}
        transition={{ duration: 0.45 }}
      >
        {MEMBER_CARD_PLACEHOLDER}
      </motion.h2>
    );
  }
  if (props.active) {
    return (
      <h2 className={titleClass} style={{ ...style, color: disabledColor }}>
        {MEMBER_CARD_PLACEHOLDER}
      </h2>
    );
  }
  return (
    <h2 className={titleClass} style={style}>
      {previewLabel ??
        t({ id: "member_card.draft_idle", message: "Pick a license" })}
    </h2>
  );
};

const memberSubtitle = (
  props: MemberCardHeadlineProps,
  previewBlurb: string | undefined,
  style: CSSProperties,
): ReactNode => {
  if (props.showEmail && props.name && props.email) {
    return props.typingReveal ? (
      <TypewriterText
        key={`reveal-email-${props.displayKey}`}
        text={props.email}
        as="p"
        className="break-words"
        style={style}
        speedMs={22}
      />
    ) : (
      <p className="break-words" style={style}>
        {props.email}
      </p>
    );
  }
  return !props.cinematic && previewBlurb ? (
    <p className="break-words" style={style}>
      {previewBlurb}
    </p>
  ) : (
    <span aria-hidden="true">&nbsp;</span>
  );
};
