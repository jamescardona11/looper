import { msg } from "@lingui/core/macro";
import { useLingui } from "@lingui/react";
import {
  Broom as BrushCleaning,
  CaretRight as ChevronRight,
  Ghost,
  X,
} from "@phosphor-icons/react";
import { AnimatePresence, motion } from "framer-motion";
import type { ComponentType, ReactNode } from "react";
import type { ShortcutBinding } from "../../../contracts/index";
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

const copy = {
  add: msg({
    id: "settings.general.shortcuts.add_shortcut",
    message: "+ Add shortcut",
  }),
  temporary: msg({
    id: "settings.general.shortcuts.temporary",
    message: "Temporary",
  }),
  cleanup: msg({
    id: "settings.general.shortcuts.cleanup",
    message: "Cleanup",
  }),
  remove: msg({
    id: "settings.general.shortcuts.remove_shortcut",
    message: "Remove shortcut",
  }),
  listening: msg({
    id: "settings.general.shortcuts.listening_for_keys",
    message: "Listening for keys…",
  }),
  hide: msg({
    id: "settings.general.shortcuts.hide_shortcuts",
    message: "Hide shortcuts",
  }),
  show: msg({
    id: "settings.general.shortcuts.show_shortcuts",
    message: "Show shortcuts",
  }),
} as const;

const revealMotion = {
  initial: { height: 0, opacity: 0 },
  animate: { height: "auto", opacity: 1 },
  exit: { height: 0, opacity: 0 },
  transition: { duration: 0.18, ease: "easeOut" },
} as const;

type Labels = Record<keyof typeof copy, string>;

function useShortcutLabels(): Labels {
  const { i18n } = useLingui();
  return Object.fromEntries(
    Object.entries(copy).map(([key, descriptor]) => [key, i18n._(descriptor)]),
  ) as Labels;
}

export function ShortcutBindingList(props: ShortcutBindingListProps) {
  const labels = useShortcutLabels();
  const list = shortcutBindingView({
    mode: props.mode,
    bindings: props.bindings,
    invalidDrafts: props.invalidDrafts,
    activeCapture: props.activeCapture,
    emptyLabel: labels.add,
  });
  const row = bindingRowProps(props, labels);
  const showExpansion = list.alternativeCount > 0 || list.canAdd;

  return (
    <div className="w-full">
      <BindingRow
        {...row}
        item={list.primary}
        primary
        trailing={
          showExpansion ? (
            <ExpansionControl
              expanded={props.expanded}
              alternativeCount={list.alternativeCount}
              labels={labels}
              onToggle={props.onToggleExpand}
            />
          ) : null
        }
      />
      <AnimatePresence initial={false}>
        {props.expanded ? (
          <motion.div {...revealMotion} className="overflow-hidden">
            <div className="space-y-1 pt-1">
              {list.alternatives.map((item) => (
                <BindingRow
                  {...row}
                  key={`${props.mode}-${item.index}`}
                  item={item}
                  trailing={
                    <RemoveBinding
                      label={labels.remove}
                      onRemove={() => props.onRemove(props.mode, item.index)}
                    />
                  }
                />
              ))}
              {list.canAdd ? (
                <AddBinding
                  label={labels.add}
                  onAdd={() => props.onAdd(props.mode)}
                />
              ) : null}
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}

function bindingRowProps(props: ShortcutBindingListProps, labels: Labels) {
  return {
    mode: props.mode,
    enabled: props.enabled,
    capturePreview: props.capturePreview,
    temporaryLabel: labels.temporary,
    cleanupLabel: labels.cleanup,
    cleanupDisabled: props.cleanupDisabled,
    onCapture: props.onCapture,
    onUpdate: props.onUpdate,
  };
}

type BindingRowProps = ReturnType<typeof bindingRowProps> & {
  item: ShortcutBindingItem;
  primary?: boolean;
  trailing: ReactNode;
};

function BindingRow({
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
}: BindingRowProps) {
  const flags = bindingFlags({
    item,
    mode,
    temporaryLabel,
    cleanupLabel,
    cleanupDisabled,
    onUpdate,
  });
  return (
    <>
      <div className={bindingRowClass(item, primary, enabled)}>
        <button
          type="button"
          onClick={() => onCapture(item.index)}
          className={[
            "flex min-w-0 flex-1 items-center gap-1.5 text-left",
            enabled ? "hover:text-content-primary" : "",
          ].join(" ")}
        >
          <BindingKey item={item} capturePreview={capturePreview} />
        </button>
        {flags.map((flag) => (
          <FlagControl key={flag.kind} {...flag} />
        ))}
        {trailing}
      </div>
      {item.error ? (
        <p className="mt-1 ui-text-micro ui-color-error" role="alert">
          {item.error}
        </p>
      ) : null}
    </>
  );
}

type FlagSpec = {
  kind: "temporary" | "cleanup";
  label: string;
  tone: "local" | "cloud";
  active: boolean;
  disabled: boolean;
  Icon: ComponentType<{ size: number; "aria-hidden": "true" }>;
  onClick: () => void;
};

function bindingFlags(args: {
  item: ShortcutBindingItem;
  mode: ShortcutMode;
  temporaryLabel: string;
  cleanupLabel: string;
  cleanupDisabled: boolean;
  onUpdate: ShortcutBindingListProps["onUpdate"];
}): FlagSpec[] {
  const update = (patch: Partial<ShortcutBinding>) =>
    args.onUpdate(args.mode, args.item.index, patch);
  return [
    {
      kind: "temporary",
      label: args.temporaryLabel,
      tone: "local",
      active: args.item.binding.temporary,
      disabled: false,
      Icon: Ghost,
      onClick: () => update({ temporary: !args.item.binding.temporary }),
    },
    {
      kind: "cleanup",
      label: args.cleanupLabel,
      tone: "cloud",
      active: args.item.binding.cleanup_enabled,
      disabled: args.cleanupDisabled,
      Icon: BrushCleaning,
      onClick: () =>
        update({ cleanup_enabled: !args.item.binding.cleanup_enabled }),
    },
  ];
}

function BindingKey({
  item,
  capturePreview,
}: {
  item: ShortcutBindingItem;
  capturePreview: string;
}) {
  const { i18n } = useLingui();
  if (!item.capturing) return <span className="truncate">{item.display}</span>;
  return (
    <>
      <motion.span
        className="h-1 w-1 rounded-full bg-cloud"
        animate={{ opacity: [0.3, 1, 0.3] }}
        transition={{ duration: 1, repeat: Infinity }}
      />
      <span
        className={[
          "truncate",
          capturePreview ? "ui-color-primary" : "ui-color-muted",
        ].join(" ")}
      >
        {capturePreview || i18n._(copy.listening)}
      </span>
    </>
  );
}

function FlagControl({
  label,
  tone,
  active,
  disabled,
  Icon,
  onClick,
}: FlagSpec) {
  const activeClass =
    tone === "local"
      ? "border-[var(--color-local-30)] bg-[var(--color-local-10)] text-[var(--color-local)]"
      : "border-[var(--color-cloud-30)] bg-[var(--color-cloud-10)] text-[var(--color-cloud)]";
  const idleClass =
    "border-transparent ui-color-muted hover:bg-surface-overlay hover:ui-color-secondary";
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      aria-pressed={active}
      title={label}
      className={[
        "box-border flex h-5 w-5 shrink-0 items-center justify-center rounded-md border leading-none transition-colors [&_svg]:block [&_svg]:shrink-0 disabled:pointer-events-none disabled:opacity-40",
        active ? activeClass : idleClass,
      ].join(" ")}
    >
      <Icon size={13} aria-hidden="true" />
    </button>
  );
}

function ExpansionControl({
  expanded,
  alternativeCount,
  labels,
  onToggle,
}: {
  expanded: boolean;
  alternativeCount: number;
  labels: Labels;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-expanded={expanded}
      aria-label={expanded ? labels.hide : labels.show}
      className="flex w-10 shrink-0 items-center justify-center gap-1 rounded px-1.5 py-0.5 ui-text-meta ui-color-muted transition-colors hover:bg-surface-overlay hover:ui-color-secondary"
    >
      <AlternativeCount count={alternativeCount} />
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

function AlternativeCount({ count }: { count: number }) {
  return (
    <span className="flex w-5 items-center justify-center">
      <motion.span
        animate={{ x: count > 0 ? -2 : 0 }}
        transition={{ duration: 0.14, ease: "easeOut" }}
      >
        +
      </motion.span>
      <span className="relative ml-0.5 inline-flex h-3 w-1.5 overflow-hidden">
        {[1, 2].map((candidate) => (
          <motion.span
            key={candidate}
            className="absolute inset-0 flex items-center justify-start"
            animate={{
              opacity: count === candidate ? 1 : 0,
              y: count === candidate ? 0 : count > candidate ? -3 : 3,
            }}
            transition={{ duration: 0.12, ease: "easeOut" }}
          >
            {candidate}
          </motion.span>
        ))}
      </span>
    </span>
  );
}

function RemoveBinding({
  label,
  onRemove,
}: {
  label: string;
  onRemove: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onRemove}
      aria-label={label}
      className="h-5 w-5 ui-button-ghost ui-hover-error-strong"
    >
      <X size={13} aria-hidden="true" />
    </button>
  );
}

function AddBinding({ label, onAdd }: { label: string; onAdd: () => void }) {
  return (
    <button
      type="button"
      onClick={onAdd}
      className="h-6 w-full border-b border-dashed border-border-primary text-left ui-text-meta ui-color-disabled transition-colors hover:border-border-secondary hover:ui-color-muted"
    >
      {label}
    </button>
  );
}

function bindingRowClass(
  item: ShortcutBindingItem,
  primary: boolean,
  enabled: boolean,
) {
  const base =
    "flex min-h-7 items-center gap-1.5 ui-text-kbd transition-colors";
  if (item.capturing && primary) {
    return `${base} rounded-[14px] border border-[var(--ui-pill-shell-border)] bg-[var(--ui-pill-shell-bg)] px-2 py-2 text-[var(--ui-capture-fg)] shadow-[var(--ui-pill-shell-shadow)]`;
  }
  if (item.capturing) {
    return `${base} border-b py-1 border-border-hover ui-color-primary`;
  }
  if (item.error) {
    return `${base} border-b border-error/40 py-1 ui-color-error`;
  }
  if (!primary) {
    return `${base} border-b border-border-primary py-1 ui-color-muted hover:border-border-secondary hover:ui-color-secondary`;
  }
  const tone = enabled
    ? "ui-color-secondary hover:border-border-secondary"
    : "ui-color-disabled";
  return `${base} border-b border-border-primary py-1 ${tone}`;
}
