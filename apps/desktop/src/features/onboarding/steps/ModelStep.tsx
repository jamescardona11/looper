import { useLingui as useModelTranslations } from "@lingui/react/macro";
import { useState } from "react";
import { createPortal as renderInBody } from "react-dom";
import { AnimatePresence as Presence, motion as Animated } from "framer-motion";
import { DownloadSimple as DownloadIcon } from "@phosphor-icons/react";
import ModelStatCard from "../../settings/models/ModelStatCard";
import { formatModelSize } from "../../../shared/lib/modelStats";
import type { DownloadEvent, ModelInfo, ModelStatus } from "../../../contracts";
import {
  OnboardingHeader as StepHeading,
  OnboardingStep as StepFrame,
  PRIMARY_BUTTON_CLASS as primaryActionClassName,
  type StepMotionProps as MotionContract,
} from "./shared";
import {
  modelContinueIntent,
  modelGridClassName,
  projectOnboardingModel,
} from "./model-step-policy";

type ModelStepProps = {
  stepMotionProps: MotionContract;
  models: ModelInfo[];
  selectedModelKey: string;
  modelStatus: Record<string, ModelStatus>;
  isLoading: boolean;
  unavailable: boolean;
  displayStateByModel: Record<string, DownloadEvent>;
  selectedModelReady: boolean;
  showLocalConfirm: boolean;
  onShowConfirm: (show: boolean) => void;
  onSelectModel: (key: string) => void;
  onDownload: (key: string, ane?: boolean) => void;
  onNext: () => void;
};

type CatalogProps = Pick<
  ModelStepProps,
  | "models"
  | "selectedModelKey"
  | "modelStatus"
  | "isLoading"
  | "unavailable"
  | "displayStateByModel"
  | "onSelectModel"
>;

const MESSAGE_PANEL_CLASS_NAME =
  "w-full overflow-hidden rounded-xl border border-border-secondary bg-surface-surface text-left";
const MESSAGE_CLASS_NAME = "p-4 ui-text-body-sm text-content-muted";

function CatalogMessage({ children }: { children: string }) {
  return (
    <div className={MESSAGE_PANEL_CLASS_NAME}>
      <p className={MESSAGE_CLASS_NAME}>{children}</p>
    </div>
  );
}

function ModelCatalog(props: CatalogProps) {
  const { t } = useModelTranslations();
  if (props.isLoading) {
    return (
      <CatalogMessage>
        {t({
          id: "onboarding.model.loading",
          message: "Finding a model for your device",
        })}
      </CatalogMessage>
    );
  }
  if (props.models.length === 0) {
    const emptyMessage = props.unavailable
      ? t({
          id: "onboarding.model.unavailable",
          message: "Model list unavailable. You can add one later in Settings.",
        })
      : t({
          id: "onboarding.model.empty",
          message: "No models found. You can add one later in Settings.",
        });
    return <CatalogMessage>{emptyMessage}</CatalogMessage>;
  }

  return (
    <div
      role="radiogroup"
      aria-label={t({
        id: "onboarding.model.choices",
        message: "Local transcription model",
      })}
      className={modelGridClassName(props.models.length)}
    >
      {props.models.map((model) => {
        const card = projectOnboardingModel(
          model,
          props.modelStatus[model.key],
          props.displayStateByModel[model.key],
        );
        return (
          <ModelStatCard
            key={model.key}
            model={card.model}
            status={card.status}
            progress={card.progress}
            width={300}
            selected={model.key === props.selectedModelKey}
            onSelect={() => props.onSelectModel(model.key)}
            showActions={false}
          />
        );
      })}
    </div>
  );
}

type ConfirmationProps = {
  modelLabel: string;
  modelSize: string;
  onStay: () => void;
  onDownload: () => void;
  onContinue: () => void;
};

const CONFIRM_OVERLAY = {
  key: "model-confirm",
  initial: { opacity: 0 },
  animate: { opacity: 1 },
  exit: { opacity: 0, transition: { duration: 0.18 } },
  className:
    "fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-6 backdrop-blur-xs",
};
const CONFIRM_CARD = {
  initial: { scale: 0.96, opacity: 0 },
  animate: { scale: 1, opacity: 1 },
  exit: { scale: 0.96, opacity: 0 },
  transition: { duration: 0.18 },
  className:
    "w-full max-w-sm rounded-2xl border border-border-primary bg-surface-tertiary p-6 text-center ui-shadow-modal-deep",
  role: "dialog",
  "aria-modal": true,
  "aria-labelledby": "onboarding-model-confirm-title",
} as const;
const CONFIRM_SECONDARY_CLASS_NAME =
  "rounded-lg border border-border-secondary px-4 py-2 ui-text-body-sm font-medium text-content-secondary transition-colors hover:border-border-hover";
const CONFIRM_PRIMARY_CLASS_NAME =
  "rounded-lg bg-content-primary px-4 py-2 ui-text-body-sm font-semibold text-surface-secondary transition-opacity hover:opacity-90";

function ConfirmModelDownload(props: ConfirmationProps) {
  const { t } = useModelTranslations();
  return (
    <Animated.div {...CONFIRM_OVERLAY} onClick={props.onStay}>
      <Animated.div
        {...CONFIRM_CARD}
        onClick={(event) => event.stopPropagation()}
      >
        <DownloadIcon size={22} className="mx-auto mb-3 text-cloud" />
        <p
          id="onboarding-model-confirm-title"
          className="ui-text-body-lg font-semibold text-content-primary"
        >
          {t({
            id: "onboarding.model.confirm.title",
            message: "Download your model?",
          })}
        </p>
        <p className="mt-1 ui-text-label text-content-disabled text-pretty">
          <span className="font-semibold text-content-secondary">
            {props.modelLabel} · {props.modelSize}
          </span>
          <br />
          {t({
            id: "onboarding.model.confirm.body",
            message:
              "The download continues in the background while you finish setup.",
          })}
        </p>
        <div className="mt-5 flex justify-center gap-2">
          <button
            type="button"
            onClick={props.onContinue}
            className={CONFIRM_SECONDARY_CLASS_NAME}
          >
            {t({
              id: "onboarding.model.confirm.continue",
              message: "Continue anyway",
            })}
          </button>
          <button
            type="button"
            onClick={props.onDownload}
            className={CONFIRM_PRIMARY_CLASS_NAME}
          >
            {t({
              id: "onboarding.model.confirm.download",
              message: "Download",
            })}
          </button>
        </div>
      </Animated.div>
    </Animated.div>
  );
}

function DownloadConfirmationPortal({
  visible,
  ...confirmation
}: ConfirmationProps & { visible: boolean }) {
  return renderInBody(
    <Presence>
      {visible ? <ConfirmModelDownload {...confirmation} /> : null}
    </Presence>,
    document.body,
  );
}

export function ModelStep(props: ModelStepProps) {
  const { t } = useModelTranslations();
  const [confirmDismissed, setConfirmDismissed] = useState(false);
  const selectedModel =
    props.models.find(({ key }) => key === props.selectedModelKey) ?? null;

  const handleContinue = () => {
    const intent = modelContinueIntent(
      props.isLoading,
      props.selectedModelReady,
    );
    if (intent === "confirm") props.onShowConfirm(true);
    if (intent === "advance") props.onNext();
  };
  const dismissConfirmation = () => {
    setConfirmDismissed(true);
    props.onShowConfirm(false);
  };
  const continueWithoutDownload = () => {
    dismissConfirmation();
    props.onNext();
  };
  const downloadAndContinue = () => {
    dismissConfirmation();
    if (selectedModel) props.onDownload(selectedModel.key);
    props.onNext();
  };
  const confirmationSize = formatModelSize(
    selectedModel
      ? selectedModel.size_mb + (selectedModel.ane_size_mb ?? 0)
      : 0,
  );
  const footer = (
    <button
      type="button"
      onClick={handleContinue}
      disabled={props.isLoading}
      className={primaryActionClassName}
    >
      {t({ id: "onboarding.model.continue", message: "Continue" })}
    </button>
  );

  return (
    <StepFrame
      stepKey="model"
      motionProps={props.stepMotionProps}
      widthClass="max-w-2xl"
      footer={footer}
    >
      <StepHeading
        title={t({
          id: "onboarding.model.title",
          message: "Set up local transcription",
        })}
        subtitle={t({
          id: "onboarding.model.subtitle",
          message: "Choose the local model that fits how you work.",
        })}
      />
      <ModelCatalog {...props} />
      <DownloadConfirmationPortal
        visible={props.showLocalConfirm && !confirmDismissed}
        modelLabel={selectedModel?.label ?? "Local model"}
        modelSize={confirmationSize}
        onStay={() => props.onShowConfirm(false)}
        onDownload={downloadAndContinue}
        onContinue={continueWithoutDownload}
      />
    </StepFrame>
  );
}
