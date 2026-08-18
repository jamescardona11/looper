import { useLingui } from "@lingui/react/macro";
import type { ReactNode } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  Broom as BrushCleaning,
  CaretRight as ChevronRight,
  Ghost,
  X,
} from "@phosphor-icons/react";
import type { ShortcutBinding } from "../../../../types";
import {
  shortcutBindingView,
  type CaptureMode,
  type ShortcutBindingItem,
  type ShortcutMode,
} from "./shortcut-binding-model";

type ShortcutBindingListProps = {
  mode: ShortcutMode;
  bindings: ShortcutBinding[];
  invalidDrafts?: Record<number, string>;
  enabled: boolean;
  expanded: boolean;
  activeCapture: CaptureMode;
  capturePreview: string;
  onCapture: (index: number) => void;
  onToggleExpand: () => void;
  onUpdate: (
    mode: ShortcutMode,
    index: number,
    patch: Partial<ShortcutBinding>,
  ) => void;
  onAdd: (mode: ShortcutMode) => void;
  onRemove: (mode: ShortcutMode, index: number) => void;
  cleanupDisabled: boolean;
};

export function ShortcutBindingList(props: ShortcutBindingListProps) {
  const { t } = useLingui();
  const labels = {
    add: t({
      id: "settings.general.shortcuts.add_shortcut",
      message: "+ Add shortcut",
    }),
    temporary: t({
      id: "settings.general.shortcuts.temporary",
      message: "Temporary",
    }),
    cleanup: t({
      id: "settings.general.shortcuts.cleanup",
      message: "Cleanup",
    }),
  };
  const view = shortcutBindingView({
    mode: props.mode,
    bindings: props.bindings,
    invalidDrafts: props.invalidDrafts,
    activeCapture: props.activeCapture,
    emptyLabel: labels.add,
  });

  return (
    <div className="w-full">
      <BindingLine
        item={view.primary}
        mode={props.mode}
        primary
        enabled={props.enabled}
        capturePreview={props.capturePreview}
        temporaryLabel={labels.temporary}
        cleanupLabel={labels.cleanup}
        cleanupDisabled={props.cleanupDisabled}
        onCapture={props.onCapture}
        onUpdate={props.onUpdate}
        trailing={
          view.alternativeCount > 0 || view.canAdd ? (
            <ExpansionButton
              expanded={props.expanded}
              alternativeCount={view.alternativeCount}
              onToggle={props.onToggleExpand}
            />
          ) : null
        }
      />

      <AnimatePresence initial={false}>
        {props.expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.18, ease: "easeOut" }}
            className="overflow-hidden"
          >
            <div className="space-y-1 pt-1">
              {view.alternatives.map((item) => (
                <BindingLine
                  key={`${props.mode}-${item.index}`}
                  item={item}
                  mode={props.mode}
                  enabled={props.enabled}
                  capturePreview={props.capturePreview}
                  temporaryLabel={labels.temporary}
                  cleanupLabel={labels.cleanup}
                  cleanupDisabled={props.cleanupDisabled}
                  onCapture={props.onCapture}
                  onUpdate={props.onUpdate}
                  trailing={
                    <button
                      type="button"
                      onClick={() => props.onRemove(props.mode, item.index)}
                      aria-label={t({
                        id: "settings.general.shortcuts.remove_shortcut",
                        message: "Remove shortcut",
                      })}
                      className="h-5 w-5 ui-button-ghost ui-hover-error-strong"
                    >
                      <X size={13} aria-hidden="true" />
                    </button>
                  }
                />
              ))}

              {view.canAdd && (
                <button
                  type="button"
                  onClick={() => props.onAdd(props.mode)}
                  className="h-6 w-full border-b border-dashed border-border-primary text-left ui-text-meta ui-color-disabled transition-colors hover:border-border-secondary hover:ui-color-muted"
                >
                  {labels.add}
                </button>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function BindingLine({
  item,
  mode,
  primary = false,
  enabled,
  capturePreview,
  temporaryLabel,
  cleanupLabel,
  cleanupDisabled,
  trailing,
  onCapture,
  onUpdate,
}: {
  item: ShortcutBindingItem;
  mode: ShortcutMode;
  primary?: boolean;
  enabled: boolean;
  capturePreview: string;
  temporaryLabel: string;
  cleanupLabel: string;
  cleanupDisabled: boolean;
  trailing: ReactNode;
  onCapture: (index: number) => void;
  onUpdate: (
    mode: ShortcutMode,
    index: number,
    patch: Partial<ShortcutBinding>,
  ) => void;
}) {
  return (
    <>
      <div className={bindingLineClass(item, primary, enabled)}>
        <button
          type="button"
          onClick={() => onCapture(item.index)}
          className={`flex min-w-0 flex-1 items-center gap-1.5 text-left ${
            enabled ? "hover:text-content-primary" : ""
          }`}
        >
          <BindingLabel item={item} capturePreview={capturePreview} />
        </button>
        <ShortcutFlagButton
          label={temporaryLabel}
          tone="local"
          active={item.binding.temporary}
          onClick={() =>
            onUpdate(mode, item.index, {
              temporary: !item.binding.temporary,
            })
          }
        >
          <Ghost size={13} aria-hidden="true" />
        </ShortcutFlagButton>
        <ShortcutFlagButton
          label={cleanupLabel}
          tone="cloud"
          active={item.binding.cleanup_enabled}
          disabled={cleanupDisabled}
          onClick={() =>
            onUpdate(mode, item.index, {
              cleanup_enabled: !item.binding.cleanup_enabled,
            })
          }
        >
          <BrushCleaning size={13} aria-hidden="true" />
        </ShortcutFlagButton>
        {trailing}
      </div>
      {item.error && (
        <p className="mt-1 ui-text-micro ui-color-error" role="alert">
          {item.error}
        </p>
      )}
    </>
  );
}

function BindingLabel({
  item,
  capturePreview,
}: {
  item: ShortcutBindingItem;
  capturePreview: string;
}) {
  const { t } = useLingui();
  if (!item.capturing) return <span className="truncate">{item.display}</span>;
  return (
    <>
      <motion.span
        className="h-1 w-1 rounded-full bg-cloud"
        animate={{ opacity: [0.3, 1, 0.3] }}
        transition={{ duration: 1, repeat: Infinity }}
      />
      <span
        className={`truncate ${
          capturePreview ? "ui-color-primary" : "ui-color-muted"
        }`}
      >
        {capturePreview ||
          t({
            id: "settings.general.shortcuts.listening_for_keys",
            message: "Listening for keys…",
          })}
      </span>
    </>
  );
}

function ExpansionButton({
  expanded,
  alternativeCount,
  onToggle,
}: {
  expanded: boolean;
  alternativeCount: number;
  onToggle: () => void;
}) {
  const { t } = useLingui();
  const accessibleLabel = expanded
    ? t({
        id: "settings.general.shortcuts.hide_shortcuts",
        message: "Hide shortcuts",
      })
    : t({
        id: "settings.general.shortcuts.show_shortcuts",
        message: "Show shortcuts",
      });
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-expanded={expanded}
      aria-label={accessibleLabel}
      className="flex w-10 shrink-0 items-center justify-center gap-1 rounded px-1.5 py-0.5 ui-text-meta ui-color-muted transition-colors hover:bg-surface-overlay hover:ui-color-secondary"
    >
      <span className="flex w-5 items-center justify-center">
        <motion.span
          animate={{ x: alternativeCount > 0 ? -2 : 0 }}
          transition={{ duration: 0.14, ease: "easeOut" }}
        >
          +
        </motion.span>
        <span className="relative ml-0.5 inline-flex h-3 w-1.5 overflow-hidden">
          {[1, 2].map((count) => (
            <motion.span
              key={count}
              className="absolute inset-0 flex items-center justify-start"
              animate={{
                opacity: alternativeCount === count ? 1 : 0,
                y:
                  alternativeCount === count
                    ? 0
                    : alternativeCount > count
                      ? -3
                      : 3,
              }}
              transition={{ duration: 0.12, ease: "easeOut" }}
            >
              {count}
            </motion.span>
          ))}
        </span>
      </span>
      <motion.span
        animate={{ rotate: expanded ? 90 : 0 }}
        transition={{ duration: 0.15 }}
        className="flex items-center"
      >
        <ChevronRight size={12} aria-hidden="true" />
      </motion.span>
    </button>
  );
}

function ShortcutFlagButton({
  label,
  tone,
  active,
  disabled = false,
  onClick,
  children,
}: {
  label: string;
  tone: "local" | "cloud";
  active: boolean;
  disabled?: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  const activeClass =
    tone === "local"
      ? "border-[var(--color-local-30)] bg-[var(--color-local-10)] text-[var(--color-local)]"
      : "border-[var(--color-cloud-30)] bg-[var(--color-cloud-10)] text-[var(--color-cloud)]";
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      aria-pressed={active}
      title={label}
      className={`box-border flex h-5 w-5 shrink-0 items-center justify-center rounded-md border leading-none transition-colors [&_svg]:block [&_svg]:shrink-0 disabled:pointer-events-none disabled:opacity-40 ${
        active
          ? activeClass
          : "border-transparent ui-color-muted hover:bg-surface-overlay hover:ui-color-secondary"
      }`}
    >
      {children}
    </button>
  );
}

function bindingLineClass(
  item: ShortcutBindingItem,
  primary: boolean,
  enabled: boolean,
) {
  const base =
    "flex min-h-7 items-center gap-1.5 ui-text-kbd transition-colors";
  if (item.capturing && primary) {
    return `${base} rounded-[14px] border border-[var(--ui-pill-shell-border)] bg-[var(--ui-pill-shell-bg)] px-2 py-2 text-[var(--ui-capture-fg)] shadow-[var(--ui-pill-shell-shadow)]`;
  }
  if (item.capturing)
    return `${base} border-b py-1 border-border-hover ui-color-primary`;
  if (item.error) return `${base} border-b border-error/40 py-1 ui-color-error`;
  if (!primary) {
    return `${base} border-b border-border-primary py-1 ui-color-muted hover:border-border-secondary hover:ui-color-secondary`;
  }
  return `${base} border-b border-border-primary py-1 ${
    enabled
      ? "ui-color-secondary hover:border-border-secondary"
      : "ui-color-disabled"
  }`;
}
