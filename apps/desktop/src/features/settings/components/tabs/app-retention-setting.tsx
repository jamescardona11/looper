import { useLingui } from "@lingui/react/macro";
import type { ReactNode } from "react";
import { Dropdown } from "../../../../shared/ui/Dropdown";
import type { AppAutomationProps } from "./AppTab.types";
import {
  inlineAutoDeleteDropdownProps,
  type AppTabControls,
} from "./useAppTabControls";

const retentionClass = {
  description: "mt-1 block ui-text-micro ui-color-disabled",
  field: "relative overflow-visible px-2 py-1.5",
  label: "shrink-0 ui-text-label-strong ui-color-primary",
  mutedLabel: "shrink-0 ui-text-label-strong ui-color-muted",
  row: "flex items-center gap-x-1 whitespace-nowrap",
  rowLarge: "flex flex-wrap items-center gap-x-1 gap-y-1",
} as const;

function RetentionField({
  children,
  description,
  wrap,
}: {
  children: ReactNode;
  description: string;
  wrap?: boolean;
}) {
  return (
    <div className={retentionClass.field}>
      <div className={wrap ? retentionClass.rowLarge : retentionClass.row}>
        {children}
      </div>
      <span className={retentionClass.description}>{description}</span>
    </div>
  );
}

export function RetentionSetting({
  controls,
  ...props
}: AppAutomationProps & { controls: AppTabControls }) {
  const { t } = useLingui();
  return (
    <>
      <RetentionField
        wrap={props.textSizeMode === "large"}
        description={t({
          id: "settings.app.auto_delete.body",
          message: "Deleting transcripts also removes their saved audio.",
        })}
      >
        <span className={retentionClass.label}>
          {t({ id: "settings.app.auto_delete", message: "Auto-delete" })}
        </span>
        <Dropdown
          value={props.autoDeleteTarget}
          onChange={(value) =>
            void controls.applyAutoDeleteChange(value, props.autoDeleteDuration)
          }
          options={controls.pruneTargetOptions}
          disabled={controls.isPreviewingPrune}
          {...inlineAutoDeleteDropdownProps}
        />
        <span className={retentionClass.mutedLabel}>
          {t({ id: "settings.app.auto_delete.after", message: "after" })}
        </span>
        <Dropdown
          value={props.autoDeleteDuration}
          onChange={(value) =>
            void controls.applyAutoDeleteChange(props.autoDeleteTarget, value)
          }
          options={controls.recordingPruneOptions}
          disabled={controls.isPreviewingPrune}
          {...inlineAutoDeleteDropdownProps}
        />
      </RetentionField>
      <RetentionField
        description={t({
          id: "settings.app.audio_budget.body",
          message:
            "When the limit is exceeded, Looper removes the oldest saved audio first and keeps every transcript.",
        })}
      >
        <span className={retentionClass.label}>
          {t({
            id: "settings.app.audio_budget",
            message: "Keep dictation audio under",
          })}
        </span>
        <Dropdown
          value={props.audioStorageBudgetMb}
          onChange={(value) => void controls.applyAudioBudgetChange(value)}
          options={controls.audioBudgetOptions}
          disabled={controls.isPreviewingBudget}
          {...inlineAutoDeleteDropdownProps}
        />
      </RetentionField>
    </>
  );
}
