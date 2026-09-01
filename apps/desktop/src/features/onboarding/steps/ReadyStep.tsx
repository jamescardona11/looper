import { useLingui as useReadyTranslations } from "@lingui/react/macro";
import { motion as Animated } from "framer-motion";
import {
  useCallback,
  useRef,
  useState,
  type ReactNode,
  type RefObject,
} from "react";
import {
  CheckCircle as VerifiedIcon,
  PencilSimple as EditIcon,
  SpinnerGap as PendingIcon,
} from "@phosphor-icons/react";
import { formatShortcutForDisplay as displayShortcut } from "../../../shared/lib/shortcuts";
import { useShortcutCapture as useNativeShortcutCapture } from "../../../shared/hooks/useShortcutCapture";
import { useMountEffect } from "../../../shared/hooks/useMountEffect";
import { subscribePillInserted } from "../../../data/capture/overlay";
import { setShortcutCaptureActive } from "../../../data/settings";
import {
  OnboardingHeader as StepHeading,
  OnboardingStep as StepFrame,
  PRIMARY_BUTTON_CLASS as primaryActionClassName,
  type StepMotionProps as MotionContract,
} from "./shared";
import {
  autoLaunchThumbClassName,
  autoLaunchTrackClassName,
  insertionEvidenceIsValid,
} from "./ready-step-policy";

type ReadyStepProps = {
  stepMotionProps: MotionContract;
  smartShortcut: string;
  onSetShortcut: (shortcut: string) => void;
  modelLabel: string | null;
  meetingIntelligenceLabel: string;
  autoLaunch: boolean;
  onSetAutoLaunch: (value: boolean) => void;
  licenseActive: boolean;
  onOpenLicense: () => void;
  isCompleting: boolean;
  completionError: string | null;
  onComplete: () => void;
};

const VERIFICATION_CARD_CLASS_NAME =
  "onboarding-verification-card mb-7 w-full rounded-xl border border-border-primary bg-surface-secondary p-4 text-left";
const INSERTION_FIELD_CLASS_NAME =
  "mt-3 min-h-20 w-full resize-none rounded-lg border border-border-secondary bg-surface-surface px-3 py-2 ui-text-body-sm text-content-primary outline-none focus:border-border-hover focus:ring-2 focus:ring-border-primary";
const RECAP_CLASS_NAME =
  "onboarding-recap w-full divide-y divide-border-secondary border-y border-border-secondary text-left";
const SHORTCUT_BUTTON_CLASS_NAME =
  "group flex items-center gap-1.5 rounded-md bg-surface-elevated px-2 py-1 transition-colors hover:bg-surface-overlay";
const LICENSE_ACTION_CLASS_NAME =
  "shrink-0 ui-text-body-sm-strong text-cloud underline-offset-4 transition-colors hover:underline";
const SWITCH_MOTION = {
  layout: true,
  transition: { type: "spring", stiffness: 500, damping: 32 },
} as const;

function CompletionButton({
  completing,
  onComplete,
}: {
  completing: boolean;
  onComplete: () => void;
}) {
  const { t } = useReadyTranslations();
  return (
    <button
      type="button"
      onClick={onComplete}
      disabled={completing}
      aria-busy={completing}
      className={primaryActionClassName}
    >
      {completing ? (
        <>
          <PendingIcon size={14} className="animate-spin" />
          {t({ id: "onboarding.done.saving", message: "Saving..." })}
        </>
      ) : (
        t({ id: "onboarding.done.cta", message: "Start dictating" })
      )}
    </button>
  );
}

function VerificationCard({
  verified,
  fieldRef,
  shortcut,
}: {
  verified: boolean;
  fieldRef: RefObject<HTMLTextAreaElement | null>;
  shortcut: string;
}) {
  const { t } = useReadyTranslations();
  return (
    <div className={VERIFICATION_CARD_CLASS_NAME}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="ui-text-body-sm-strong text-content-primary">
            {t({
              id: "onboarding.done.verify.title",
              message: "Make your first insertion",
            })}
          </h3>
          <p className="mt-1 ui-text-meta text-content-muted">
            {t({
              id: "onboarding.done.verify.body",
              message:
                "Focus the field, use your shortcut, and say anything. Continue unlocks after Looper confirms the text was inserted.",
            })}
          </p>
        </div>
        {verified ? (
          <VerifiedIcon
            size={20}
            weight="fill"
            className="shrink-0 text-[var(--color-success)]"
            aria-label={t({
              id: "onboarding.done.verify.success",
              message: "Insertion verified",
            })}
          />
        ) : null}
      </div>
      <textarea
        ref={fieldRef}
        aria-label={t({
          id: "onboarding.done.verify.field",
          message: "First dictation test field",
        })}
        placeholder={t({
          id: "onboarding.done.verify.placeholder",
          message: "Your dictated text will appear here…",
        })}
        className={INSERTION_FIELD_CLASS_NAME}
      />
      <p className="mt-2 font-mono ui-text-micro text-content-disabled">
        {shortcut}
      </p>
    </div>
  );
}

function RecapRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4 py-3.5">
      <span className="ui-text-body-sm-strong text-content-primary">
        {label}
      </span>
      {children}
    </div>
  );
}

function ShortcutControl({
  shortcut,
  capturing,
  preview,
  onStartCapture,
}: {
  shortcut: string;
  capturing: boolean;
  preview: string;
  onStartCapture: () => void;
}) {
  const { t } = useReadyTranslations();
  return (
    <RecapRow
      label={t({
        id: "onboarding.done.recap.shortcut",
        message: "Smart shortcut",
      })}
    >
      <button
        type="button"
        onClick={onStartCapture}
        className={SHORTCUT_BUTTON_CLASS_NAME}
      >
        {capturing ? (
          <span className="flex items-center gap-1.5 font-mono ui-text-body-sm text-cloud">
            <Animated.span
              className="h-1.5 w-1.5 rounded-full bg-cloud"
              animate={{ opacity: [0.35, 1, 0.35] }}
              transition={{ duration: 1, repeat: Infinity }}
            />
            {preview ||
              t({
                id: "onboarding.done.recap.shortcut_capture",
                message: "Press a shortcut",
              })}
          </span>
        ) : (
          <>
            <span className="font-mono ui-text-body-sm text-content-secondary">
              {shortcut}
            </span>
            <EditIcon
              size={12}
              className="text-content-disabled transition-colors group-hover:text-content-secondary"
            />
          </>
        )}
      </button>
    </RecapRow>
  );
}

function AutoLaunchControl({
  enabled,
  onChange,
}: {
  enabled: boolean;
  onChange: (value: boolean) => void;
}) {
  const { t } = useReadyTranslations();
  return (
    <button
      type="button"
      role="switch"
      aria-checked={enabled}
      onClick={() => onChange(!enabled)}
      className="flex w-full items-center justify-between gap-4 py-3.5 text-left"
    >
      <span>
        <span className="block ui-text-body-sm-strong text-content-primary">
          {t({ id: "onboarding.done.auto_launch", message: "Open at login" })}
        </span>
        <span className="mt-0.5 block ui-text-meta text-content-muted">
          {t({
            id: "onboarding.done.auto_launch.body",
            message: "Start Looper when you log in.",
          })}
        </span>
      </span>
      <span className={autoLaunchTrackClassName(enabled)}>
        <Animated.span
          {...SWITCH_MOTION}
          className={autoLaunchThumbClassName(enabled)}
        />
      </span>
    </button>
  );
}

function SetupRecap(props: {
  shortcut: string;
  capturing: boolean;
  preview: string;
  onStartCapture: () => void;
  modelLabel: string | null;
  meetingIntelligenceLabel: string;
  autoLaunch: boolean;
  onSetAutoLaunch: (value: boolean) => void;
}) {
  const { t } = useReadyTranslations();
  return (
    <div className={RECAP_CLASS_NAME}>
      <ShortcutControl {...props} />
      {props.modelLabel ? (
        <RecapRow
          label={t({ id: "onboarding.done.recap.model", message: "Model" })}
        >
          <span className="ui-text-body-sm text-content-secondary">
            {props.modelLabel}
          </span>
        </RecapRow>
      ) : null}
      <RecapRow label="Meeting intelligence">
        <span className="ui-text-body-sm text-content-secondary">
          {props.meetingIntelligenceLabel}
        </span>
      </RecapRow>
      <AutoLaunchControl
        enabled={props.autoLaunch}
        onChange={props.onSetAutoLaunch}
      />
    </div>
  );
}

function LicenseSummary({
  active,
  onOpen,
}: {
  active: boolean;
  onOpen: () => void;
}) {
  const { t } = useReadyTranslations();
  const title = active
    ? t({
        id: "onboarding.done.license_active_title",
        message: "License active",
      })
    : t({
        id: "onboarding.done.free_title",
        message: "Dictation is free forever",
      });
  const detail = active
    ? t({
        id: "onboarding.done.license_active",
        message: "Every feature is unlocked.",
      })
    : t({
        id: "onboarding.done.license_adds",
        message:
          "Unlock Cleanup, Edit Mode, Personalities, File Transcription, and more.",
      });
  return (
    <div className="mt-8 flex w-full items-start justify-between gap-4 text-left">
      <span>
        <span className="block ui-text-body-sm-strong text-content-primary">
          {title}
        </span>
        <span className="mt-0.5 block ui-text-meta text-content-muted text-pretty">
          {detail}
        </span>
      </span>
      {active ? null : (
        <button
          type="button"
          onClick={onOpen}
          className={LICENSE_ACTION_CLASS_NAME}
        >
          {t({ id: "onboarding.done.get_license", message: "Get a license" })}
        </button>
      )}
    </div>
  );
}

export function ReadyStep(props: ReadyStepProps) {
  const { t } = useReadyTranslations();
  const shortcut = displayShortcut(props.smartShortcut);
  const [isCapturing, setIsCapturing] = useState(false);
  const [shortcutPreview, setShortcutPreview] = useState("");
  const [insertionVerified, setInsertionVerified] = useState(false);
  const insertionFieldRef = useRef<HTMLTextAreaElement>(null);

  useMountEffect(() => {
    let cancelled = false;
    const unlisten = subscribePillInserted((payload) => {
      window.requestAnimationFrame(() => {
        const fieldValue = insertionFieldRef.current?.value ?? "";
        if (!cancelled && insertionEvidenceIsValid(payload, fieldValue)) {
          setInsertionVerified(true);
        }
      });
    });
    return () => {
      cancelled = true;
      void unlisten.then((dispose) => dispose());
    };
  });

  const endShortcutCapture = useCallback(async () => {
    await setShortcutCaptureActive(false).catch(() => {});
    setIsCapturing(false);
    setShortcutPreview("");
  }, []);
  useNativeShortcutCapture({
    active: isCapturing,
    onCancel: endShortcutCapture,
    onPreviewChange: setShortcutPreview,
    onShortcutCaptured: props.onSetShortcut,
  });

  const beginShortcutCapture = () => {
    setShortcutPreview("");
    setIsCapturing(true);
    setShortcutCaptureActive(true).catch(() => setIsCapturing(false));
  };
  const footer = (
    <CompletionButton
      completing={props.isCompleting}
      onComplete={props.onComplete}
    />
  );

  return (
    <StepFrame
      stepKey="done"
      motionProps={props.stepMotionProps}
      footer={footer}
    >
      <StepHeading
        title={t({ id: "onboarding.done.title", message: "You're set" })}
        subtitle={t({
          id: "onboarding.done.subtitle",
          message: "Press your shortcut in any app to dictate.",
        })}
      />
      <VerificationCard
        verified={insertionVerified}
        fieldRef={insertionFieldRef}
        shortcut={shortcut}
      />
      <SetupRecap
        shortcut={shortcut}
        capturing={isCapturing}
        preview={shortcutPreview}
        onStartCapture={beginShortcutCapture}
        modelLabel={props.modelLabel}
        meetingIntelligenceLabel={props.meetingIntelligenceLabel}
        autoLaunch={props.autoLaunch}
        onSetAutoLaunch={props.onSetAutoLaunch}
      />
      <p className="mt-3 ui-text-meta text-content-disabled">
        {t({
          id: "onboarding.done.more_options",
          message: "More options available in Settings.",
        })}
      </p>
      <LicenseSummary
        active={props.licenseActive}
        onOpen={props.onOpenLicense}
      />
      {props.completionError ? (
        <p className="mt-4 ui-text-meta text-error">{props.completionError}</p>
      ) : null}
    </StepFrame>
  );
}
