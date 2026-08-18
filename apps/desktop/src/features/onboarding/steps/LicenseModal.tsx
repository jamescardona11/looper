import { useLingui as useLicenseTranslations } from "@lingui/react/macro";
import { AnimatePresence as Presence, motion as Animated } from "framer-motion";
import { useRef, useState, type FormEvent } from "react";
import { createPortal as renderInBody } from "react-dom";
import {
  ArrowRight as SubmitIcon,
  CircleNotch as PendingIcon,
  X as CloseIcon,
} from "@phosphor-icons/react";
import MemberCard from "../../license/components/MemberCard";
import CustomerPortalLink from "../../license/components/CustomerPortalLink";
import { useMountEffect } from "../../../shared/hooks/useMountEffect";
import type { LicenseState } from "../../../data/license";
import type { PurchaseTier } from "../../license/purchaseConfig";

const SOFT_EASE = [0.22, 1, 0.36, 1] as const;
const LAYOUT_TRANSITION = {
  layout: { duration: 0.34, ease: SOFT_EASE },
} as const;

type LicenseModalProps = {
  licenseState: LicenseState | null;
  licenseLoading: boolean;
  activating: boolean;
  openingTarget: PurchaseTier | null;
  openError: string | null;
  activationError: string | null;
  onOpenCheckout: (tier: PurchaseTier) => void;
  onActivateLicense: (key: string) => void;
  onClose: () => void;
};

type LicenseModalViewProps = LicenseModalProps & {
  active: boolean;
  licenseKey: string;
  activationAttempt: number;
  onLicenseKeyChange: (value: string) => void;
  onSubmitActivation: (event: FormEvent) => void;
  onRevealComplete: () => void;
};

const OVERLAY_PROPS = {
  key: "license-modal",
  initial: { opacity: 0 },
  animate: { opacity: 1 },
  exit: { opacity: 0, transition: { duration: 0.45, ease: SOFT_EASE } },
  className:
    "fixed inset-0 z-50 flex items-center justify-center bg-black/88 px-6 backdrop-blur-2xl",
};

const PANEL_PROPS = {
  layout: true,
  initial: { scale: 0.96, opacity: 0 },
  animate: { scale: 1, opacity: 1 },
  exit: {
    scale: 0.97,
    opacity: 0,
    y: -6,
    transition: { duration: 0.42, ease: SOFT_EASE },
  },
  transition: {
    duration: 0.18,
    layout: { duration: 0.34, ease: SOFT_EASE },
  },
  className: "relative flex w-full max-w-[400px] flex-col items-center gap-4",
  role: "dialog",
  "aria-modal": true,
} as const;

const INTRO_PROPS = {
  key: "license-intro",
  layout: true,
  initial: { opacity: 0 },
  animate: { opacity: 1 },
  exit: { opacity: 0 },
  transition: { duration: 0.2 },
  className: "max-w-[340px] text-center",
} as const;

const FORM_PROPS = {
  key: "activate-form",
  layout: true,
  initial: { opacity: 0 },
  animate: { opacity: 1 },
  exit: { opacity: 0 },
  transition: { duration: 0.2 },
  className:
    "flex w-full max-w-[340px] items-center gap-2 border-b border-white/15 transition-colors focus-within:border-white/40",
} as const;

const CLOSE_CLASS_NAME =
  "absolute -right-1 -top-1 z-10 flex h-7 w-7 items-center justify-center rounded-full text-white/65 transition-colors hover:text-white";
const LICENSE_INPUT_CLASS_NAME =
  "min-w-0 flex-1 bg-transparent px-0.5 py-2 font-mono ui-text-body-sm text-white placeholder-white/35 outline-none";
const ACTIVATE_CLASS_NAME =
  "inline-flex h-7 items-center gap-1 px-1 ui-text-button-sm text-white/65 transition-colors hover:text-white disabled:opacity-40";
const PORTAL_LINK_CLASS_NAME =
  "inline-flex items-center gap-1.5 ui-text-meta text-white/65 transition-colors hover:text-white";

function LicenseIntro() {
  const { t } = useLicenseTranslations();
  return (
    <Animated.div {...INTRO_PROPS}>
      <p className="ui-text-body-lg-strong text-white">
        {t({
          id: "onboarding.license.free_title",
          message: "Dictation is free forever",
        })}
      </p>
      <p className="mt-1 ui-text-body-sm text-white/70 text-pretty">
        {t({
          id: "onboarding.license.free_body",
          message:
            "Unlock AI cleanup, voice editing, per-app personalities, audio and video transcription, and more.",
        })}
      </p>
    </Animated.div>
  );
}

function ActivationForm(props: {
  licenseKey: string;
  activating: boolean;
  onLicenseKeyChange: (value: string) => void;
  onSubmit: (event: FormEvent) => void;
}) {
  const { t } = useLicenseTranslations();
  return (
    <Animated.form {...FORM_PROPS} onSubmit={props.onSubmit}>
      <input
        value={props.licenseKey}
        onChange={(event) => props.onLicenseKeyChange(event.target.value)}
        placeholder={t({
          id: "onboarding.license.placeholder",
          message: "Already bought? Paste your key",
        })}
        aria-label={t({
          id: "onboarding.license.input_aria",
          message: "License key",
        })}
        className={LICENSE_INPUT_CLASS_NAME}
      />
      <button
        type="submit"
        disabled={props.activating || props.licenseKey.trim().length === 0}
        className={ACTIVATE_CLASS_NAME}
      >
        {props.activating ? (
          <PendingIcon size={12} className="animate-spin" />
        ) : null}
        {t({ id: "onboarding.license.activate", message: "Activate" })}
        {!props.activating && <SubmitIcon size={12} aria-hidden="true" />}
      </button>
    </Animated.form>
  );
}

function LicenseModalView(props: LicenseModalViewProps) {
  const { t } = useLicenseTranslations();
  const displayedError = props.activationError ?? props.openError;
  return (
    <Animated.div {...OVERLAY_PROPS} onClick={props.onClose}>
      <Animated.div
        {...PANEL_PROPS}
        onClick={(event) => event.stopPropagation()}
        aria-label={t({
          id: "onboarding.license.dialog_aria",
          message: "License",
        })}
      >
        <button
          type="button"
          onClick={props.onClose}
          aria-label={t({
            id: "onboarding.license.close",
            message: "Close",
          })}
          className={CLOSE_CLASS_NAME}
        >
          <CloseIcon size={14} />
        </button>

        <Presence mode="popLayout">
          {props.active ? null : <LicenseIntro />}
        </Presence>

        <Animated.div layout transition={LAYOUT_TRANSITION}>
          <MemberCard
            active={props.active}
            activating={props.activating}
            activationAttempt={props.activationAttempt}
            licenseLoading={props.licenseLoading}
            licenseState={props.licenseState}
            openingTarget={props.openingTarget}
            checkoutDisabled={props.openingTarget !== null}
            onOpenCheckout={props.onOpenCheckout}
            onRevealComplete={props.onRevealComplete}
          />
        </Animated.div>

        <Presence mode="popLayout">
          {props.active ? null : (
            <ActivationForm
              licenseKey={props.licenseKey}
              activating={props.activating}
              onLicenseKeyChange={props.onLicenseKeyChange}
              onSubmit={props.onSubmitActivation}
            />
          )}
        </Presence>

        {displayedError ? (
          <Animated.p
            layout
            className="w-full max-w-[340px] ui-text-meta text-red-400"
          >
            {displayedError}
          </Animated.p>
        ) : null}

        <Animated.div layout transition={LAYOUT_TRANSITION}>
          <CustomerPortalLink
            source="onboarding"
            className={PORTAL_LINK_CLASS_NAME}
          />
        </Animated.div>
      </Animated.div>
    </Animated.div>
  );
}

export function LicenseModal(props: LicenseModalProps) {
  const [licenseKey, setLicenseKey] = useState("");
  const [activationAttempt, setActivationAttempt] = useState(0);
  const dismissTimerRef = useRef<number | null>(null);
  const active = props.licenseState?.status === "active";

  useMountEffect(() => () => {
    const scheduledDismissal = dismissTimerRef.current;
    if (scheduledDismissal !== null) window.clearTimeout(scheduledDismissal);
  });

  const handleRevealComplete = () => {
    if (dismissTimerRef.current !== null) return;
    dismissTimerRef.current = window.setTimeout(props.onClose, 1500);
  };
  const submitActivation = (event: FormEvent) => {
    event.preventDefault();
    const normalizedKey = licenseKey.trim();
    if (normalizedKey.length === 0) return;
    setActivationAttempt((attempt) => attempt + 1);
    props.onActivateLicense(normalizedKey);
  };

  return renderInBody(
    <LicenseModalView
      {...props}
      active={active}
      licenseKey={licenseKey}
      activationAttempt={activationAttempt}
      onLicenseKeyChange={setLicenseKey}
      onSubmitActivation={submitActivation}
      onRevealComplete={handleRevealComplete}
    />,
    document.body,
  );
}
