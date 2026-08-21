import { useLingui } from "@lingui/react/macro";
import SectionLabel from "../../../../shared/ui/SectionLabel";
import ToggleSwitch from "../../../../shared/ui/ToggleSwitch";
import WatchFoldersSetting from "../../../library/import/WatchFoldersSetting";
import type { AppArchiveProps } from "./AppTab.types";
import { isAppSectionVisible } from "./app-section-model";
import type { AppTabControls } from "./useAppTabControls";

export function AppStorageSection({
  controls,
  ...props
}: AppArchiveProps & { controls: AppTabControls }) {
  const { t } = useLingui();
  const visible = isAppSectionVisible(props.activeSection, "storage");
  return (
    <>
      <section className={visible ? "space-y-2" : "hidden"}>
        <SectionLabel>
          {t({
            id: "settings.app.watch_folders",
            message: "Watch folders",
          })}
        </SectionLabel>
        <WatchFoldersSetting />
      </section>
      <section className={visible ? "space-y-2" : "hidden"}>
        <SectionLabel>
          {t({
            id: "settings.app.markdown_mirror",
            message: "Markdown archive",
          })}
        </SectionLabel>
        <div className="rounded-lg bg-surface-surface p-2.5">
          <div className="px-2 py-1.5">
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <span className="block ui-text-label-strong ui-color-primary">
                  {t({
                    id: "settings.app.markdown_mirror.label",
                    message: "Mirror new content to Markdown",
                  })}
                </span>
                <span className="mt-0.5 block ui-text-micro ui-color-disabled">
                  {t({
                    id: "settings.app.markdown_mirror.body",
                    message:
                      "Writes dictations, recordings, and meetings to a folder you choose. Looper never imports or deletes these files.",
                  })}
                </span>
              </div>
              <ToggleSwitch
                enabled={props.markdownMirrorEnabled}
                disabled={!props.markdownMirrorPath}
                onToggle={() =>
                  props.onMarkdownMirrorEnabledChange(
                    !props.markdownMirrorEnabled,
                  )
                }
                ariaLabel={t({
                  id: "settings.app.markdown_mirror.toggle_aria",
                  message: "Toggle Markdown archive",
                })}
              />
            </div>
            <div className="mt-2 flex items-center gap-2">
              <button
                type="button"
                onClick={() => void controls.chooseMarkdownMirrorFolder()}
                className="shrink-0 rounded-md border border-border-subtle px-2 py-1 ui-text-meta ui-color-muted transition-colors hover:border-border-strong hover:text-content-primary"
              >
                {props.markdownMirrorPath
                  ? t({
                      id: "settings.app.markdown_mirror.change_folder",
                      message: "Change folder",
                    })
                  : t({
                      id: "settings.app.markdown_mirror.choose_folder",
                      message: "Choose folder",
                    })}
              </button>
              <span
                className="min-w-0 truncate ui-text-micro ui-color-disabled"
                title={props.markdownMirrorPath}
              >
                {props.markdownMirrorPath ||
                  t({
                    id: "settings.app.markdown_mirror.no_folder",
                    message: "No folder selected",
                  })}
              </span>
            </div>
          </div>
        </div>
      </section>
    </>
  );
}
