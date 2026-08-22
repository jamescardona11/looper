import { useLingui } from "@lingui/react/macro";
import SectionLabel from "../../../shared/ui/SectionLabel";
import type { GeneralFeatureProps } from "./GeneralTab.types";
import { isGeneralSectionVisible } from "./general-settings-model";
import { EditModeFeature } from "./general-edit-mode-feature";
import {
  FeatureToggle,
  type GeneralFeatureToggle,
} from "./general-feature-toggle";

export function GeneralFeatureSection(props: GeneralFeatureProps) {
  const { t } = useLingui();
  const toggles: GeneralFeatureToggle[] = [
    {
      key: "dictionary",
      label: t({
        id: "settings.general.auto_dictionary",
        message: "Auto Dictionary",
      }),
      description: props.autoDictionarySupported
        ? t({
            id: "settings.general.auto_dictionary.body",
            message: "suggests names and terms after you correct dictated text",
          })
        : t({
            id: "settings.general.auto_dictionary.unsupported_body",
            message: "requires a model with dictionary support",
          }),
      enabled: props.autoDictionarySupported && props.autoDictionaryEnabled,
      disabled: !props.autoDictionarySupported,
      onToggle: () =>
        props.setAutoDictionaryEnabled(!props.autoDictionaryEnabled),
      ariaLabel: t({
        id: "settings.general.auto_dictionary.toggle_aria",
        message: "Toggle Auto Dictionary",
      }),
    },
    {
      key: "dictation-preview",
      label: t({
        id: "settings.general.preview_before_insert",
        message: "Preview Before Inserting",
      }),
      description: t({
        id: "settings.general.preview_before_insert.body",
        message:
          "review and edit the transcript in the pill — Enter inserts, Esc cancels",
      }),
      enabled: props.previewBeforeInsertEnabled,
      onToggle: () =>
        props.setPreviewBeforeInsertEnabled(!props.previewBeforeInsertEnabled),
      ariaLabel: t({
        id: "settings.general.preview_before_insert.toggle_aria",
        message: "Toggle Preview Before Inserting",
      }),
    },
    {
      key: "transform-preview",
      label: t({
        id: "settings.general.preview_before_insert_selection",
        message: "Preview Before Applying Transforms",
      }),
      description: t({
        id: "settings.general.preview_before_insert_selection.body",
        message:
          "same as above, but for Selection Mode's Replace/Insert actions — on by default since transforms are costlier to undo than dictation",
      }),
      enabled: props.previewBeforeInsertSelectionEnabled,
      onToggle: () =>
        props.setPreviewBeforeInsertSelectionEnabled(
          !props.previewBeforeInsertSelectionEnabled,
        ),
      ariaLabel: t({
        id: "settings.general.preview_before_insert_selection.toggle_aria",
        message: "Toggle Preview Before Applying Transforms",
      }),
    },
    {
      key: "screen-context",
      label: t({
        id: "settings.general.use_screen_context",
        message: "Use Screen Context",
      }),
      description: t({
        id: "settings.general.use_screen_context.body",
        message:
          "let Selection Mode transforms read visible text for better results — Accessibility is used first; on macOS 14+, Screen Recording and on-device OCR fill gaps in canvases or images. Only recognized text is sent to your configured writing provider; screenshots are never saved or uploaded",
      }),
      enabled: props.useScreenContext,
      onToggle: () => props.setUseScreenContext(!props.useScreenContext),
      ariaLabel: t({
        id: "settings.general.use_screen_context.toggle_aria",
        message: "Toggle Use Screen Context",
      }),
    },
  ];

  return (
    <section
      data-settings-section="behavior"
      className={
        isGeneralSectionVisible(props.activeSection, "behavior")
          ? "space-y-2"
          : "hidden"
      }
    >
      <SectionLabel>
        {t({ id: "settings.general.features", message: "Features" })}
      </SectionLabel>
      <div className="space-y-3">
        <EditModeFeature {...props} />
        {toggles.map(({ key, ...toggle }) => (
          <FeatureToggle key={key} {...toggle} />
        ))}
      </div>
    </section>
  );
}
