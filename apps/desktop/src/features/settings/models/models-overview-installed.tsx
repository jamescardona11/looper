import { useLingui } from "@lingui/react/macro";
import { CaretRight as ChevronRight } from "@phosphor-icons/react";

import SectionLabel from "../../../shared/ui/SectionLabel";
import type { ModelInfo, ModelStatus } from "../../../types/index";
import { InstalledModelRow } from "./InstalledModelRow";

type InstalledModelsProps = Record<"installed", ModelInfo[]> &
  Record<"status", Record<string, ModelStatus>> &
  Record<"activeKey", string> &
  Record<"localMode" | "revealDelete", boolean> &
  Record<"onBrowse", () => void> &
  Record<"onUse" | "onDelete", (key: string) => void>;

const BROWSE_BUTTON = [
  "group inline-flex shrink-0 items-center gap-1",
  "ui-text-body-sm-strong ui-color-secondary transition-colors",
  "hover:ui-color-primary",
].join(" ");

export function InstalledModels(props: InstalledModelsProps) {
  const { t } = useLingui();
  return (
    <section className="flex min-h-0 flex-1 flex-col gap-2">
      <div className="flex shrink-0 items-center gap-3">
        <SectionLabel className="flex-1">
          {t({ id: "settings.models.installed", message: `Installed` })}
        </SectionLabel>
        <button
          type="button"
          onClick={props.onBrowse}
          className={BROWSE_BUTTON}
        >
          {t({
            id: "settings.models.browse_all",
            message: `Browse all models`,
          })}
          <ChevronRight
            size={15}
            className="transition-transform group-hover:translate-x-0.5"
            aria-hidden="true"
          />
        </button>
      </div>
      <div className="-mr-2 flex min-h-0 flex-1 flex-col overflow-y-auto pr-2">
        {props.installed.map((model) => (
          <InstalledModelRow
            key={model.key}
            model={model}
            active={props.localMode && model.key === props.activeKey}
            aneInstalled={Boolean(props.status[model.key]?.ane_installed)}
            revealDelete={props.revealDelete}
            onUse={() => props.onUse(model.key)}
            onDelete={() => props.onDelete(model.key)}
          />
        ))}
      </div>
    </section>
  );
}
