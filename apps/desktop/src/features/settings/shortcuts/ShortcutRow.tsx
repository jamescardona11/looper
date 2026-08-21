import { useLingui } from "@lingui/react/macro";
import ToggleSwitch from "../../../shared/ui/ToggleSwitch";
import { ShortcutBindingList } from "./ShortcutBindingList";
import type { GeneralShortcutProps } from "../general/GeneralTab.types";
import type {
  CaptureMode,
  InvalidShortcutDrafts,
  ShortcutMode,
} from "./shortcut-binding-model";

type ShortcutRowProps = {
  mode: ShortcutMode;
  label: string;
  description: string;
  bindings: GeneralShortcutProps["shortcutBindings"][ShortcutMode];
  invalidDrafts?: Record<number, string>;
  enabled: boolean;
  isExpanded: boolean;
  captureActive: CaptureMode;
  capturePreview: string;
  onToggle: () => void;
  onCapture: (index: number) => void;
  onToggleExpand: () => void;
  onUpdateBinding: GeneralShortcutProps["updateShortcutBinding"];
  onAddBinding: GeneralShortcutProps["addShortcutBinding"];
  onRemoveBinding: GeneralShortcutProps["removeShortcutBinding"];
  canDisable: boolean;
  cleanupDisabled: boolean;
};

function shortcutRowView(props: ShortcutRowProps) {
  return {
    className: [
      "space-y-1.5 px-2 py-1.5",
      props.enabled ? "opacity-100" : "opacity-80",
    ].join(" "),
    identity: { label: props.label, description: props.description },
    toggle: {
      enabled: props.enabled,
      disabled: props.enabled && !props.canDisable,
      onToggle: props.onToggle,
    },
    bindings: {
      mode: props.mode,
      bindings: props.bindings,
      invalidDrafts: props.invalidDrafts,
      enabled: props.enabled,
      expanded: props.isExpanded,
      activeCapture: props.captureActive,
      capturePreview: props.capturePreview,
      onCapture: props.onCapture,
      onToggleExpand: props.onToggleExpand,
      onUpdate: props.onUpdateBinding,
      onAdd: props.onAddBinding,
      onRemove: props.onRemoveBinding,
      cleanupDisabled: props.cleanupDisabled,
    },
  };
}

function ShortcutRowHeader({
  view,
}: {
  view: ReturnType<typeof shortcutRowView>;
}) {
  const { t } = useLingui();
  return (
    <header className="flex items-center justify-between gap-2">
      <div className="flex min-w-0 items-center gap-2">
        <span className="ui-text-label-strong ui-color-primary">
          {view.identity.label}
        </span>
        <span className="truncate ui-text-meta ui-color-disabled">
          {view.identity.description}
        </span>
      </div>
      <ToggleSwitch
        {...view.toggle}
        ariaLabel={t({
          id: "settings.general.shortcut.toggle_aria",
          message: `Toggle ${view.identity.label} shortcut`,
        })}
      />
    </header>
  );
}

export function ShortcutRow(props: ShortcutRowProps) {
  const view = shortcutRowView(props);
  return (
    <section className={view.className}>
      <ShortcutRowHeader view={view} />
      <ShortcutBindingList {...view.bindings} />
    </section>
  );
}

export type { CaptureMode, InvalidShortcutDrafts, ShortcutMode };
