import { useLingui } from "@lingui/react/macro";
import ToggleSwitch from "../../../../shared/ui/ToggleSwitch";
import type { ShortcutBinding } from "../../../../types";
import { ShortcutBindingList } from "./ShortcutBindingList";
import type {
  CaptureMode,
  InvalidShortcutDrafts,
  ShortcutMode,
} from "./shortcut-binding-model";

export type { CaptureMode, InvalidShortcutDrafts, ShortcutMode };

type ShortcutRowProps = {
  mode: ShortcutMode;
  label: string;
  description: string;
  bindings: ShortcutBinding[];
  invalidDrafts?: Record<number, string>;
  enabled: boolean;
  isExpanded: boolean;
  captureActive: CaptureMode;
  capturePreview: string;
  onToggle: () => void;
  onCapture: (index: number) => void;
  onToggleExpand: () => void;
  onUpdateBinding: (
    mode: ShortcutMode,
    index: number,
    patch: Partial<ShortcutBinding>,
  ) => void;
  onAddBinding: (mode: ShortcutMode) => void;
  onRemoveBinding: (mode: ShortcutMode, index: number) => void;
  canDisable: boolean;
  cleanupDisabled: boolean;
};

export function ShortcutRow({
  mode,
  label,
  description,
  bindings,
  invalidDrafts,
  enabled,
  isExpanded,
  captureActive,
  capturePreview,
  onToggle,
  onCapture,
  onToggleExpand,
  onUpdateBinding,
  onAddBinding,
  onRemoveBinding,
  canDisable,
  cleanupDisabled,
}: ShortcutRowProps) {
  const { t } = useLingui();

  return (
    <section
      className={`space-y-1.5 px-2 py-1.5 ${
        enabled ? "opacity-100" : "opacity-80"
      }`}
    >
      <header className="flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <span className="ui-text-label-strong ui-color-primary">{label}</span>
          <span className="truncate ui-text-meta ui-color-disabled">
            {description}
          </span>
        </div>
        <ToggleSwitch
          enabled={enabled}
          onToggle={onToggle}
          ariaLabel={t({
            id: "settings.general.shortcut.toggle_aria",
            message: `Toggle ${label} shortcut`,
          })}
          disabled={enabled && !canDisable}
        />
      </header>
      <ShortcutBindingList
        mode={mode}
        bindings={bindings}
        invalidDrafts={invalidDrafts}
        enabled={enabled}
        expanded={isExpanded}
        activeCapture={captureActive}
        capturePreview={capturePreview}
        onCapture={onCapture}
        onToggleExpand={onToggleExpand}
        onUpdate={onUpdateBinding}
        onAdd={onAddBinding}
        onRemove={onRemoveBinding}
        cleanupDisabled={cleanupDisabled}
      />
    </section>
  );
}
