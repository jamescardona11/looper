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

export function ModelPickerRow({
  group,
  selected,
  active,
  installed,
  aneInstalled,
  isVariantInstalled,
  shiftHeld,
  progress,
  onSelectVariant,
  onUse,
  onDownload,
  onDelete,
  onCancel,
}: ModelPickerRowProps) {
  const { t } = useLingui();
  const [aneChoice, setAneChoice] = useState<boolean | null>(null);
  const aneChecked = aneChoice ?? !installed;
  const aneAvailable = selected.ane_size_mb !== null;
  const aneEnabled = aneAvailable && (aneInstalled || aneChecked);
  const needsAneDownload =
    installed && aneAvailable && aneChecked && !aneInstalled;
  const downloading = progress?.status === "downloading" ? progress : null;
  const failed = progress?.status === "error" ? progress : null;
  const cancelled = progress?.status === "cancelled";
  const busy = Boolean(downloading || failed || cancelled);
  const percent = Math.round(progress?.percent ?? 0);
  const showVariants = group.variants.length > 1 && !busy;
  const showAne = aneAvailable && !busy;
  const displaySize =
    selected.size_mb + (aneEnabled ? (selected.ane_size_mb ?? 0) : 0);
  const downloadLabel = installed
    ? t({
        id: "model_picker.ane.download",
        message: "Download Neural Engine encoder",
      })
    : t({ id: "model_picker.download", message: "Download" });
  const chooseModel = () => {
    if (!installed && selected.downloadable) onDownload(aneEnabled);
    else if (needsAneDownload) onDownload(true);
    else onUse();
  };

  return (
    <div className="group grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 rounded-lg px-2.5 py-2 transition-colors hover:bg-surface-elevated/40">
      <button
        type="button"
        onClick={chooseModel}
        title={
          needsAneDownload
            ? downloadLabel
            : installed && !active
              ? t({ id: "model_picker.use", message: "Use" })
              : undefined
        }
        className="flex min-w-0 items-center gap-2.5 text-left"
      >
        <span
          aria-hidden="true"
          className={`h-1.5 w-1.5 shrink-0 rounded-full transition-colors ${
            active
              ? "bg-local"
              : installed
                ? "bg-content-disabled/50"
                : "bg-transparent"
          }`}
        />
        <span className="min-w-0">
          <span className="flex min-w-0 items-center gap-1.5 ui-text-body-sm-strong text-content-primary">
            <span className="truncate">{group.label}</span>
            {active ? (
              <span className="sr-only">
                {" "}
                {t({ id: "model_picker.active", message: "Active" })}
              </span>
            ) : null}
            {hasModelCapability(selected, MODEL_CAPABILITY_STREAMING) ? (
              <span
                className="inline-flex shrink-0 text-content-muted"
                title={t({
                  id: "model_picker.capability.streaming",
                  message: "Live streaming",
                })}
              >
                <Waveform size={13} aria-hidden="true" />
              </span>
            ) : null}
            {hasModelCapability(selected, MODEL_CAPABILITY_TIMESTAMPS) ? (
              <span
                className="inline-flex shrink-0 text-content-muted"
                title={t({
                  id: "model_picker.capability.timestamps",
                  message: "Word-level timestamps",
                })}
              >
                <Clock size={13} aria-hidden="true" />
              </span>
            ) : null}
          </span>
          <span className="mt-0.5 block ui-text-meta tabular-nums text-content-muted">
            {group.englishOnly
              ? t({ id: "model_picker.english", message: "English" })
              : t({ id: "model_picker.multilingual", message: "Multilingual" })}
            {"  ·  "}
            {formatModelSize(displaySize)}
          </span>
        </span>
      </button>
      <div className="flex items-center justify-end gap-3">
        {showVariants ? (
          <div className="inline-flex items-center overflow-hidden rounded-md border border-border-secondary">
            {group.variants.map((variant, index) => {
              const selectedVariant = variant.key === selected.key;
              const installedVariant = isVariantInstalled(variant.key);
              return (
                <button
                  key={variant.key}
                  type="button"
                  onClick={() => onSelectVariant(variant.key)}
                  aria-pressed={selectedVariant}
                  className={`px-2.5 py-1 font-mono ui-text-micro tabular-nums transition-colors outline-hidden focus-visible:[box-shadow:var(--focus-ring)] ${
                    index > 0 ? "border-l border-border-secondary" : ""
                  } ${selectedVariant ? "bg-local-15" : "hover:bg-surface-elevated/60"} ${
                    installedVariant
                      ? "text-local"
                      : selectedVariant
                        ? "text-content-secondary"
                        : "text-content-muted hover:text-content-primary"
                  }`}
                  title={
                    installedVariant
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
        ) : null}
        {showAne ? (
          <AneCheckbox
            checked={aneEnabled}
            installed={aneInstalled}
            onToggle={() => setAneChoice(!aneChecked)}
          />
        ) : null}
        {busy ? (
          <BusyModelAction
            progress={progress!}
            percent={percent}
            onCancel={onCancel}
          />
        ) : (
          <IdleModelActions
            installed={installed}
            downloadable={selected.downloadable}
            showAne={showAne}
            aneChecked={aneChecked}
            aneInstalled={aneInstalled}
            aneEnabled={aneEnabled}
            shiftHeld={shiftHeld}
            downloadLabel={downloadLabel}
            onDownload={onDownload}
            onDelete={onDelete}
          />
        )}
      </div>
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
      <div className="flex min-w-[140px] flex-col items-end justify-center">
        <ModelProgressDots percent={percent} status={progress.status} />
        <div className="mt-1 flex h-3 w-full items-center justify-end">
          {downloading?.verifying ? (
            <p className="truncate text-right ui-text-micro tabular-nums text-content-disabled">
              {t({ id: "models.card.verifying", message: "Verifying install" })}
            </p>
          ) : downloading ? (
            <p className="truncate text-right ui-text-micro tabular-nums text-content-disabled">
              {percent}% · {downloading.file}
            </p>
          ) : null}
          {failed ? (
            <p className="flex w-full items-center justify-end gap-1 ui-text-micro text-error">
              <AlertCircle size={9} className="shrink-0" />
              <span className="truncate">{failed.message}</span>
            </p>
          ) : null}
          {progress.status === "cancelled" ? (
            <p className="text-right ui-text-micro text-content-disabled">
              {t({ id: "model_picker.cancelled", message: "Cancelled" })}
            </p>
          ) : null}
        </div>
      </div>
      <div className="flex w-7 shrink-0 items-center justify-end">
        {downloading ? (
          <button
            type="button"
            onClick={onCancel}
            className="flex h-6 w-6 items-center justify-center rounded-md text-error transition-colors hover:bg-error/10 outline-hidden focus-visible:[box-shadow:var(--focus-ring)]"
            title={t({ id: "model_picker.cancel", message: "Cancel" })}
          >
            <Square size={10} fill="currentColor" aria-hidden="true" />
          </button>
        ) : null}
      </div>
    </>
  );
}

function IdleModelActions({
  installed,
  downloadable,
  showAne,
  aneChecked,
  aneInstalled,
  aneEnabled,
  shiftHeld,
  downloadLabel,
  onDownload,
  onDelete,
}: {
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
}) {
  const { t } = useLingui();
  const showDownload =
    (!installed && downloadable) || (showAne && aneChecked && !aneInstalled);
  return (
    <div className="flex items-center gap-1">
      <span className="flex h-6 w-6 items-center justify-center">
        {showDownload ? (
          <button
            type="button"
            onClick={() => onDownload(installed || aneEnabled)}
            className="flex h-6 w-6 items-center justify-center rounded-md text-content-secondary transition-colors hover:bg-surface-elevated/60 hover:text-content-primary outline-hidden focus-visible:[box-shadow:var(--focus-ring)]"
            title={downloadLabel}
            aria-label={downloadLabel}
          >
            <Download size={13} aria-hidden="true" />
          </button>
        ) : null}
      </span>
      <span className="flex h-6 w-6 items-center justify-center">
        {installed ? (
          <button
            type="button"
            onClick={onDelete}
            className={`flex h-6 w-6 items-center justify-center rounded-md transition-all hover:bg-error/10 hover:text-error outline-hidden focus-visible:[box-shadow:var(--focus-ring)] ${
              shiftHeld
                ? "text-error opacity-100"
                : "text-content-disabled opacity-0 group-hover:opacity-100 focus-visible:opacity-100 focus-visible:text-error"
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

  return (
    <div className="relative flex items-center gap-1" ref={infoRef}>
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
        className="flex items-center gap-1.5 rounded-md px-1 py-0.5 transition-colors enabled:hover:bg-surface-elevated/60 disabled:cursor-default"
      >
        <span
          aria-hidden="true"
          className={`flex h-3.5 w-3.5 items-center justify-center rounded-[3px] border transition-colors ${
            checked
              ? "border-local bg-local-15 text-local"
              : "border-border-secondary text-transparent"
          }`}
        >
          {checked ? <Check size={9} weight="bold" /> : null}
        </span>
        <span
          className={`font-mono ui-text-micro ${
            installed
              ? "text-local"
              : checked
                ? "text-content-secondary"
                : "text-content-muted"
          }`}
        >
          ANE
        </span>
      </button>
      <button
        type="button"
        onClick={() => setInfoOpen((open) => !open)}
        aria-expanded={infoOpen}
        aria-label={t({
          id: "model_picker.ane.info_aria",
          message: "About the Apple Neural Engine encoder",
        })}
        className="flex h-5 w-5 items-center justify-center rounded-md text-content-disabled transition-colors hover:bg-surface-elevated/60 hover:text-content-primary"
      >
        <Info size={12} aria-hidden="true" />
      </button>
      <AnimatePresence>
        {infoOpen ? (
          <motion.div
            role="tooltip"
            initial={{ opacity: 0, scale: 0.98, y: -2 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.98, y: -2 }}
            transition={{ duration: 0.12 }}
            className="ui-surface-menu absolute right-0 top-full z-30 mt-1.5 w-60 px-3 py-2"
          >
            <p className="ui-text-meta text-content-secondary">
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
  const total = 72;
  const activeCount = Math.round(Math.min(100, Math.max(0, percent)) * 0.72);
  const color =
    status === "error"
      ? "var(--color-error)"
      : status === "complete"
        ? "var(--color-success)"
        : "var(--color-local)";
  return (
    <DotMatrix
      rows={2}
      cols={36}
      activeDots={Array.from(
        { length: Math.min(activeCount, total) },
        (_, i) => i,
      )}
      dotSize={2}
      gap={2}
      color={color}
      className={status === "downloading" ? "opacity-80" : "opacity-60"}
      morphOnActive
      activeScale={1}
    />
  );
}
