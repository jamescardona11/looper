import { useLingui } from "@lingui/react/macro";
import type { ReactNode } from "react";
import { Dropdown } from "../../../shared/ui/Dropdown";
import SectionLabel from "../../../shared/ui/SectionLabel";
import type { AppAppearanceProps } from "./AppTab.types";
import { isAppSectionVisible } from "./app-section-model";
import type { AppTabControls } from "./useAppTabControls";

export function AppAppearanceSection({
  controls,
  ...props
}: AppAppearanceProps & { controls: AppTabControls }) {
  const { t } = useLingui();
  return (
    <section
      data-settings-section="appearance"
      className={
        isAppSectionVisible(props.activeSection, "appearance")
          ? "space-y-2"
          : "hidden"
      }
    >
      <SectionLabel>
        {t({ id: "settings.app.appearance", message: "Appearance" })}
      </SectionLabel>
      <div className="grid grid-cols-3 gap-3">
        <AppearanceSelect
          label={t({
            id: "settings.app.text_size.label",
            message: "Text Size",
          })}
        >
          <Dropdown
            value={props.textSizeMode}
            onChange={props.onTextSizeModeChange}
            options={controls.textSizeOptions}
          />
        </AppearanceSelect>
        <AppearanceSelect
          label={t({ id: "settings.app.theme.label", message: "Theme" })}
        >
          <div className="flex h-9 items-center rounded-md border border-border-primary bg-surface-secondary px-3 ui-text-body-sm ui-color-primary">
            {t({ id: "settings.app.theme.light", message: "Light" })}
          </div>
        </AppearanceSelect>
        <AppearanceSelect
          label={t({ id: "settings.app.language.label", message: "Language" })}
        >
          <Dropdown
            value={props.appLocale}
            onChange={props.onAppLocaleChange}
            options={controls.appLanguageOptions}
            searchable
            searchPlaceholder={t({
              id: "settings.app.language.search",
              message: "Search language...",
            })}
          />
        </AppearanceSelect>
      </div>
      <p className="ui-text-micro ui-color-disabled">
        {t({
          id: "settings.app.theme.pill_notice",
          message:
            "The workspace stays light. Looper's pill, captions, and capture overlays stay dark for consistent contrast.",
        })}
      </p>
    </section>
  );
}

function AppearanceSelect({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <label className="space-y-1.5">
      <span className="ui-text-label-strong ui-color-primary">{label}</span>
      {children}
    </label>
  );
}
