import {
  WarningCircle as AlertCircle,
  Check,
  Clock,
  Download,
  Info,
  Square,
  Trash as Trash2,
  Waveform,
} from "@phosphor-icons/react";
import { useLingui } from "@lingui/react/macro";
import { AnimatePresence, motion } from "framer-motion";
import { useRef, useState } from "react";
import type { DownloadEvent, ModelInfo } from "../../types/models";
import { useClickOutside } from "../hooks/useClickOutside";
import {
  hasModelCapability,
  MODEL_CAPABILITY_STREAMING,
  MODEL_CAPABILITY_TIMESTAMPS,
} from "../lib/modelCapabilities";
import { formatModelSize, variantLabel } from "../lib/modelStats";
import DotMatrix from "./DotMatrix";
import type { ModelGroup } from "./modelPickerLogic";

const ROW_STYLE = {
  root: "group grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 rounded-lg px-2.5 py-2 transition-colors hover:bg-surface-elevated/40",
  identity: "flex min-w-0 items-center gap-2.5 text-left",
  statusDot: "h-1.5 w-1.5 shrink-0 rounded-full transition-colors",
  modelCopy: "min-w-0",
  name: "flex min-w-0 items-center gap-1.5 ui-text-body-sm-strong text-content-primary",
  capability: "inline-flex shrink-0 text-content-muted",
  metadata: "mt-0.5 block ui-text-meta tabular-nums text-content-muted",
  actions: "flex items-center justify-end gap-3",
  variants:
    "inline-flex items-center overflow-hidden rounded-md border border-border-secondary",
  variant:
    "px-2.5 py-1 font-mono ui-text-micro tabular-nums transition-colors outline-hidden focus-visible:[box-shadow:var(--focus-ring)]",
  busyCopy: "flex min-w-[140px] flex-col items-end justify-center",
  progressCaption: "mt-1 flex h-3 w-full items-center justify-end",
  progressText:
    "truncate text-right ui-text-micro tabular-nums text-content-disabled",
  error: "flex w-full items-center justify-end gap-1 ui-text-micro text-error",
  cancelled: "text-right ui-text-micro text-content-disabled",
  cancelSlot: "flex w-7 shrink-0 items-center justify-end",
  cancel:
    "flex h-6 w-6 items-center justify-center rounded-md text-error transition-colors hover:bg-error/10 outline-hidden focus-visible:[box-shadow:var(--focus-ring)]",
  idle: "flex items-center gap-1",
  actionSlot: "flex h-6 w-6 items-center justify-center",
  download:
    "flex h-6 w-6 items-center justify-center rounded-md text-content-secondary transition-colors hover:bg-surface-elevated/60 hover:text-content-primary outline-hidden focus-visible:[box-shadow:var(--focus-ring)]",
  delete:
    "flex h-6 w-6 items-center justify-center rounded-md transition-all hover:bg-error/10 hover:text-error outline-hidden focus-visible:[box-shadow:var(--focus-ring)]",
  deleteVisible: "text-error opacity-100",
  deleteHidden:
    "text-content-disabled opacity-0 group-hover:opacity-100 focus-visible:opacity-100 focus-visible:text-error",
  ane: "relative flex items-center gap-1",
  aneToggle:
    "flex items-center gap-1.5 rounded-md px-1 py-0.5 transition-colors enabled:hover:bg-surface-elevated/60 disabled:cursor-default",
  aneBox:
    "flex h-3.5 w-3.5 items-center justify-center rounded-[3px] border transition-colors",
  aneInfo:
    "flex h-5 w-5 items-center justify-center rounded-md text-content-disabled transition-colors hover:bg-surface-elevated/60 hover:text-content-primary",
  aneTooltip:
    "ui-surface-menu absolute right-0 top-full z-30 mt-1.5 w-60 px-3 py-2",
  aneTooltipCopy: "ui-text-meta text-content-secondary",
} as const;

const TOOLTIP_MOTION = {
  initial: { opacity: 0, scale: 0.98, y: -2 },
  animate: { opacity: 1, scale: 1, y: 0 },
  exit: { opacity: 0, scale: 0.98, y: -2 },
  transition: { duration: 0.12 },
} as const;

type ModelPickerRowProps = {
  group: ModelGroup;
  selected: ModelInfo;
  active: boolean;
  installed: boolean;
  aneInstalled: boolean;
  isVariantInstalled: (key: string) => boolean;
  shiftHeld: boolean;
  progress?: DownloadEvent;
  onSelectVariant: (key: string) => void;
  onUse: () => void;
  onDownload: (ane?: boolean) => void;
  onDelete: () => void;
  onCancel: () => void;
};

function rowPresentation(
  props: ModelPickerRowProps,
  aneChoice: boolean | null,
) {
  const aneChecked = aneChoice ?? !props.installed;
  const aneAvailable = props.selected.ane_size_mb !== null;
  const aneEnabled = aneAvailable && (props.aneInstalled || aneChecked);
  const downloading =
    props.progress?.status === "downloading" ? props.progress : null;
  const failed = props.progress?.status === "error" ? props.progress : null;
  const cancelled = props.progress?.status === "cancelled";
  const busy = Boolean(downloading || failed || cancelled);
  return {
    aneChecked,
    aneAvailable,
    aneEnabled,
    needsAneDownload:
      props.installed && aneAvailable && aneChecked && !props.aneInstalled,
    downloading,
    failed,
    cancelled,
    busy,
    percent: Math.round(props.progress?.percent ?? 0),
    showVariants: props.group.variants.length > 1 && !busy,
    showAne: aneAvailable && !busy,
    displaySize:
      props.selected.size_mb +
      (aneEnabled ? (props.selected.ane_size_mb ?? 0) : 0),
  };
}

export function ModelPickerRow(props: ModelPickerRowProps) {
  const { t } = useLingui();
  const [aneChoice, setAneChoice] = useState<boolean | null>(null);
  const view = rowPresentation(props, aneChoice);
  const downloadLabel = props.installed
    ? t({
        id: "model_picker.ane.download",
        message: "Download Neural Engine encoder",
      })
    : t({ id: "model_picker.download", message: "Download" });
  const chooseModel = () => {
    if (!props.installed && props.selected.downloadable) {
      props.onDownload(view.aneEnabled);
    } else if (view.needsAneDownload) {
      props.onDownload(true);
    } else {
      props.onUse();
    }
  };
  return (
    <div className={ROW_STYLE.root}>
      <ModelIdentity
        {...props}
        displaySize={view.displaySize}
        needsAneDownload={view.needsAneDownload}
        downloadLabel={downloadLabel}
        onChoose={chooseModel}
      />
      <div className={ROW_STYLE.actions}>
        {view.showVariants ? <VariantSelector {...props} /> : null}
        {view.showAne ? (
          <AneCheckbox
            checked={view.aneEnabled}
            installed={props.aneInstalled}
            onToggle={() => setAneChoice(!view.aneChecked)}
          />
        ) : null}
        {view.busy ? (
          <BusyModelAction
            progress={props.progress!}
            percent={view.percent}
            onCancel={props.onCancel}
          />
        ) : (
          <IdleModelActions
            installed={props.installed}
            downloadable={props.selected.downloadable}
            showAne={view.showAne}
            aneChecked={view.aneChecked}
            aneInstalled={props.aneInstalled}
            aneEnabled={view.aneEnabled}
            shiftHeld={props.shiftHeld}
            downloadLabel={downloadLabel}
            onDownload={props.onDownload}
            onDelete={props.onDelete}
          />
        )}
      </div>
    </div>
  );
}

type ModelIdentityProps = ModelPickerRowProps & {
  displaySize: number;
  needsAneDownload: boolean;
  downloadLabel: string;
  onChoose: () => void;
};

function ModelIdentity(props: ModelIdentityProps) {
  const { t } = useLingui();
  const title = props.needsAneDownload
    ? props.downloadLabel
    : props.installed && !props.active
      ? t({ id: "model_picker.use", message: "Use" })
      : undefined;
  const dotTone = props.active
    ? "bg-local"
    : props.installed
      ? "bg-content-disabled/50"
      : "bg-transparent";
  return (
    <button
      type="button"
      onClick={props.onChoose}
      title={title}
      className={ROW_STYLE.identity}
    >
      <span
        aria-hidden="true"
        className={`${ROW_STYLE.statusDot} ${dotTone}`}
      />
      <span className={ROW_STYLE.modelCopy}>
        <ModelName {...props} />
        <ModelMetadata {...props} />
      </span>
    </button>
  );
}

function ModelName(props: ModelPickerRowProps) {
  const { t } = useLingui();
  return (
    <span className={ROW_STYLE.name}>
      <span className="truncate">{props.group.label}</span>
      {props.active ? (
        <span className="sr-only">
          {" "}
          {t({ id: "model_picker.active", message: "Active" })}
        </span>
      ) : null}
      <CapabilityIcon
        visible={hasModelCapability(props.selected, MODEL_CAPABILITY_STREAMING)}
        title={t({
          id: "model_picker.capability.streaming",
          message: "Live streaming",
        })}
        icon={<Waveform size={13} aria-hidden="true" />}
      />
      <CapabilityIcon
        visible={hasModelCapability(
          props.selected,
          MODEL_CAPABILITY_TIMESTAMPS,
        )}
        title={t({
          id: "model_picker.capability.timestamps",
          message: "Word-level timestamps",
        })}
        icon={<Clock size={13} aria-hidden="true" />}
      />
    </span>
  );
}

function CapabilityIcon({
  visible,
  title,
  icon,
}: {
  visible: boolean;
  title: string;
  icon: React.ReactNode;
}) {
  return visible ? (
    <span className={ROW_STYLE.capability} title={title}>
      {icon}
    </span>
  ) : null;
}

function ModelMetadata(props: ModelPickerRowProps & { displaySize: number }) {
  const { t } = useLingui();
  return (
    <span className={ROW_STYLE.metadata}>
      {props.group.englishOnly
        ? t({ id: "model_picker.english", message: "English" })
        : t({ id: "model_picker.multilingual", message: "Multilingual" })}
      {"  ·  "}
      {formatModelSize(props.displaySize)}
    </span>
  );
}

function VariantSelector(props: ModelPickerRowProps) {
  const { t } = useLingui();
  return (
    <div className={ROW_STYLE.variants}>
      {props.group.variants.map((variant, index) => {
        const selected = variant.key === props.selected.key;
        const installed = props.isVariantInstalled(variant.key);
        const className = `${ROW_STYLE.variant} ${
          index > 0 ? "border-l border-border-secondary" : ""
        } ${selected ? "bg-local-15" : "hover:bg-surface-elevated/60"} ${
          installed
            ? "text-local"
            : selected
              ? "text-content-secondary"
              : "text-content-muted hover:text-content-primary"
        }`;
        return (
          <button
            key={variant.key}
            type="button"
            onClick={() => props.onSelectVariant(variant.key)}
            aria-pressed={selected}
            className={className}
            title={
              installed
                ? t({
                    id: "model_picker.variant_installed",
                    message: "Model variant (installed)",
                  })
                : t({
                    id: "model_picker.variant",
                    message: "Model variant",
                  })
            }
          >
            {variantLabel(variant.variant)}
          </button>
        );
      })}
    </div>
  );
}

function BusyModelAction({
  progress,
  percent,
  onCancel,
}: {
  progress: DownloadEvent;
  percent: number;
  onCancel: () => void;
}) {
  const { t } = useLingui();
  const downloading = progress.status === "downloading" ? progress : null;
  const failed = progress.status === "error" ? progress : null;
  return (
    <>
      <div className={ROW_STYLE.busyCopy}>
        <ModelProgressDots percent={percent} status={progress.status} />
        <div className={ROW_STYLE.progressCaption}>
          {downloading?.verifying ? (
            <p className={ROW_STYLE.progressText}>
              {t({ id: "models.card.verifying", message: "Verifying install" })}
            </p>
          ) : downloading ? (
            <p className={ROW_STYLE.progressText}>
              {percent}% · {downloading.file}
            </p>
          ) : null}
          {failed ? (
            <p className={ROW_STYLE.error}>
              <AlertCircle size={9} className="shrink-0" />
              <span className="truncate">{failed.message}</span>
            </p>
          ) : null}
          {progress.status === "cancelled" ? (
            <p className={ROW_STYLE.cancelled}>
              {t({ id: "model_picker.cancelled", message: "Cancelled" })}
            </p>
          ) : null}
        </div>
      </div>
      <div className={ROW_STYLE.cancelSlot}>
        {downloading ? (
          <button
            type="button"
            onClick={onCancel}
            className={ROW_STYLE.cancel}
            title={t({ id: "model_picker.cancel", message: "Cancel" })}
          >
            <Square size={10} fill="currentColor" aria-hidden="true" />
          </button>
        ) : null}
      </div>
    </>
  );
}

type IdleModelActionsProps = {
  installed: boolean;
  downloadable: boolean;
  showAne: boolean;
  aneChecked: boolean;
  aneInstalled: boolean;
  aneEnabled: boolean;
  shiftHeld: boolean;
  downloadLabel: string;
  onDownload: (ane?: boolean) => void;
  onDelete: () => void;
};

function IdleModelActions(props: IdleModelActionsProps) {
  const { t } = useLingui();
  const showDownload =
    (!props.installed && props.downloadable) ||
    (props.showAne && props.aneChecked && !props.aneInstalled);
  return (
    <div className={ROW_STYLE.idle}>
      <span className={ROW_STYLE.actionSlot}>
        {showDownload ? (
          <button
            type="button"
            onClick={() =>
              props.onDownload(props.installed || props.aneEnabled)
            }
            className={ROW_STYLE.download}
            title={props.downloadLabel}
            aria-label={props.downloadLabel}
          >
            <Download size={13} aria-hidden="true" />
          </button>
        ) : null}
      </span>
      <span className={ROW_STYLE.actionSlot}>
        {props.installed ? (
          <button
            type="button"
            onClick={props.onDelete}
            className={`${ROW_STYLE.delete} ${
              props.shiftHeld ? ROW_STYLE.deleteVisible : ROW_STYLE.deleteHidden
            }`}
            title={t({ id: "model_picker.delete", message: "Delete" })}
            aria-label={t({ id: "model_picker.delete", message: "Delete" })}
          >
            <Trash2 size={12} aria-hidden="true" />
          </button>
        ) : null}
      </span>
    </div>
  );
}

function AneCheckbox({
  checked,
  installed,
  onToggle,
}: {
  checked: boolean;
  installed: boolean;
  onToggle: () => void;
}) {
  const { t } = useLingui();
  const [infoOpen, setInfoOpen] = useState(false);
  const infoRef = useRef<HTMLDivElement>(null);
  useClickOutside(infoRef, () => setInfoOpen(false), infoOpen);
  const boxTone = checked
    ? "border-local bg-local-15 text-local"
    : "border-border-secondary text-transparent";
  const labelTone = installed
    ? "text-local"
    : checked
      ? "text-content-secondary"
      : "text-content-muted";
  return (
    <div className={ROW_STYLE.ane} ref={infoRef}>
      <button
        type="button"
        role="checkbox"
        aria-checked={checked}
        disabled={installed}
        onClick={onToggle}
        title={
          installed
            ? t({
                id: "model_picker.ane.installed",
                message: "Neural Engine encoder installed",
              })
            : t({
                id: "model_picker.ane.toggle",
                message: "Include the Apple Neural Engine encoder",
              })
        }
        className={ROW_STYLE.aneToggle}
      >
        <span aria-hidden="true" className={`${ROW_STYLE.aneBox} ${boxTone}`}>
          {checked ? <Check size={9} weight="bold" /> : null}
        </span>
        <span className={`font-mono ui-text-micro ${labelTone}`}>ANE</span>
      </button>
      <button
        type="button"
        onClick={() => setInfoOpen((open) => !open)}
        aria-expanded={infoOpen}
        aria-label={t({
          id: "model_picker.ane.info_aria",
          message: "About the Apple Neural Engine encoder",
        })}
        className={ROW_STYLE.aneInfo}
      >
        <Info size={12} aria-hidden="true" />
      </button>
      <AnimatePresence>
        {infoOpen ? (
          <motion.div
            role="tooltip"
            {...TOOLTIP_MOTION}
            className={ROW_STYLE.aneTooltip}
          >
            <p className={ROW_STYLE.aneTooltipCopy}>
              {t({
                id: "model_picker.ane.info",
                message:
                  "Runs the audio encoder on the Apple Neural Engine instead of the GPU. Uses far less power and keeps the GPU open. Installing takes a few minutes while macOS optimizes it.",
              })}
            </p>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}

function ModelProgressDots({
  percent,
  status,
}: {
  percent: number;
  status: DownloadEvent["status"];
}) {
  const view = progressPresentation(percent, status);
  return (
    <DotMatrix
      rows={2}
      cols={36}
      activeDots={view.activeDots}
      dotSize={2}
      gap={2}
      color={view.color}
      className={view.className}
      morphOnActive
      activeScale={1}
    />
  );
}

function progressPresentation(
  percent: number,
  status: DownloadEvent["status"],
) {
  const bounded = Math.min(100, Math.max(0, percent));
  const activeCount = Math.round(bounded * 0.72);
  const color =
    status === "error"
      ? "var(--color-error)"
      : status === "complete"
        ? "var(--color-success)"
        : "var(--color-local)";
  return {
    activeDots: Array.from(
      { length: Math.min(activeCount, 72) },
      (_, index) => index,
    ),
    color,
    className: status === "downloading" ? "opacity-80" : "opacity-60",
  };
}
