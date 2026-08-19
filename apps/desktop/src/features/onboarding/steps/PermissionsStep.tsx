import { useLingui as usePermissionTranslations } from "@lingui/react/macro";
import { motion as Animated } from "framer-motion";
import {
  Check as GrantedIcon,
  SpinnerGap as PendingIcon,
} from "@phosphor-icons/react";
import {
  OnboardingHeader as StepHeading,
  OnboardingStep as StepFrame,
  PRIMARY_BUTTON_CLASS as primaryActionClassName,
  type StepMotionProps as MotionContract,
} from "./shared";

type PermissionsStepProps = {
  stepMotionProps: MotionContract;
  requiresMicrophone: boolean;
  requiresAccessibility: boolean;
  micPermission: boolean;
  accessibilityPermission: boolean;
  isCheckingMic: boolean;
  isCheckingAccessibility: boolean;
  onRequestMic: () => void;
  onRequestAccessibility: () => void;
  onNext: () => void;
};

type PermissionRowProps = {
  title: string;
  body: string;
  granted: boolean;
  checking: boolean;
  actionLabel: string;
  onRequest: () => void;
};

const ROW_CLASS_NAME = "flex items-center gap-4 py-4 text-left";
const ROW_TITLE_CLASS_NAME = "ui-text-body-lg-strong text-content-primary";
const ROW_BODY_CLASS_NAME = "mt-0.5 ui-text-body-sm text-content-muted";
const REQUEST_CLASS_NAME =
  "shrink-0 ui-text-body-sm-strong text-cloud underline-offset-4 transition-colors hover:underline disabled:cursor-not-allowed disabled:opacity-50";
const SKIP_CLASS_NAME =
  "ui-text-body-sm text-content-muted transition-colors hover:text-content-primary";
const STATUS_BASE_CLASS_NAME =
  "flex h-6 w-6 shrink-0 items-center justify-center rounded-full transition-colors";
const STATUS_GRANTED_CLASS_NAME = "bg-emerald-500 text-white";
const STATUS_PENDING_CLASS_NAME = "border border-border-secondary";
const CHECK_ENTRANCE = { scale: 0.6, opacity: 0 };
const CHECK_TARGET = { scale: 1, opacity: 1 };

const requestedPermissionRows = (
  props: PermissionsStepProps,
  copy: {
    microphoneTitle: string;
    microphoneBody: string;
    microphoneAction: string;
    accessibilityTitle: string;
    accessibilityBody: string;
    accessibilityAction: string;
  },
) => {
  const rows: Array<PermissionRowProps & { key: string }> = [];
  if (props.requiresMicrophone) {
    rows.push({
      key: "microphone",
      title: copy.microphoneTitle,
      body: copy.microphoneBody,
      granted: props.micPermission,
      checking: props.isCheckingMic,
      actionLabel: copy.microphoneAction,
      onRequest: props.onRequestMic,
    });
  }
  if (props.requiresAccessibility) {
    rows.push({
      key: "accessibility",
      title: copy.accessibilityTitle,
      body: copy.accessibilityBody,
      granted: props.accessibilityPermission,
      checking: props.isCheckingAccessibility,
      actionLabel: copy.accessibilityAction,
      onRequest: props.onRequestAccessibility,
    });
  }
  return rows;
};

const everyRequiredPermissionIsGranted = (props: PermissionsStepProps) =>
  [
    [props.requiresMicrophone, props.micPermission],
    [props.requiresAccessibility, props.accessibilityPermission],
  ].every(([required, granted]) => !required || granted);

function PermissionsFooter({
  allGranted,
  continueLabel,
  skipLabel,
  onNext,
}: {
  allGranted: boolean;
  continueLabel: string;
  skipLabel: string;
  onNext: () => void;
}) {
  return (
    <>
      <button
        type="button"
        onClick={onNext}
        disabled={!allGranted}
        className={primaryActionClassName}
      >
        {continueLabel}
      </button>
      <button type="button" onClick={onNext} className={SKIP_CLASS_NAME}>
        {skipLabel}
      </button>
    </>
  );
}

function PermissionStatus({
  granted,
  checking,
}: Pick<PermissionRowProps, "granted" | "checking">) {
  const statusClassName = `${STATUS_BASE_CLASS_NAME} ${
    granted ? STATUS_GRANTED_CLASS_NAME : STATUS_PENDING_CLASS_NAME
  }`;
  return (
    <div className={statusClassName}>
      {checking ? (
        <PendingIcon size={13} className="animate-spin text-content-muted" />
      ) : granted ? (
        <Animated.span initial={CHECK_ENTRANCE} animate={CHECK_TARGET}>
          <GrantedIcon size={14} weight="bold" />
        </Animated.span>
      ) : null}
    </div>
  );
}

function PermissionRow(props: PermissionRowProps) {
  return (
    <div className={ROW_CLASS_NAME}>
      <PermissionStatus granted={props.granted} checking={props.checking} />
      <div className="min-w-0 flex-1">
        <h3 className={ROW_TITLE_CLASS_NAME}>{props.title}</h3>
        <p className={ROW_BODY_CLASS_NAME}>{props.body}</p>
      </div>
      {!props.granted && (
        <button
          type="button"
          onClick={props.onRequest}
          disabled={props.checking}
          className={REQUEST_CLASS_NAME}
        >
          {props.actionLabel}
        </button>
      )}
    </div>
  );
}

export function PermissionsStep(props: PermissionsStepProps) {
  const { t } = usePermissionTranslations();
  const copy = {
    continueLabel: t({
      id: "onboarding.permissions.continue",
      message: "Continue",
    }),
    skipLabel: t({ id: "onboarding.permissions.skip", message: "Skip" }),
    title: t({ id: "onboarding.permissions.title", message: "Permissions" }),
    subtitle: t({
      id: "onboarding.permissions.subtitle",
      message: "Looper needs these to hear you and type for you.",
    }),
    microphoneTitle: t({
      id: "onboarding.microphone.title",
      message: "Microphone",
    }),
    microphoneBody: t({
      id: "onboarding.microphone.subtitle",
      message: "Hears your voice.",
    }),
    microphoneAction: t({
      id: "onboarding.microphone.grant",
      message: "Grant",
    }),
    accessibilityTitle: t({
      id: "onboarding.accessibility.title",
      message: "Accessibility",
    }),
    accessibilityBody: t({
      id: "onboarding.accessibility.subtitle",
      message: "Types text into any app.",
    }),
    accessibilityAction: t({
      id: "onboarding.accessibility.enable",
      message: "Enable in Settings",
    }),
  };
  const rows = requestedPermissionRows(props, copy);
  const allGranted = everyRequiredPermissionIsGranted(props);
  const footer = (
    <PermissionsFooter
      allGranted={allGranted}
      continueLabel={copy.continueLabel}
      skipLabel={copy.skipLabel}
      onNext={props.onNext}
    />
  );

  return (
    <StepFrame
      stepKey="permissions"
      motionProps={props.stepMotionProps}
      footer={footer}
    >
      <StepHeading title={copy.title} subtitle={copy.subtitle} />
      <div className="onboarding-permission-list w-full divide-y divide-border-secondary">
        {rows.map(({ key, ...row }) => (
          <PermissionRow key={key} {...row} />
        ))}
      </div>
    </StepFrame>
  );
}
