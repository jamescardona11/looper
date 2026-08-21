import { useLingui } from "@lingui/react/macro";
import { useMemo } from "react";
import { open } from "@tauri-apps/plugin-dialog";
import { ArrowsClockwise, FolderSimplePlus, X } from "@phosphor-icons/react";
import { showLibraryErrorToast } from "../../../data/library";

import {
  hasModelCapability,
  MODEL_CAPABILITY_TIMESTAMPS,
} from "../../../shared/lib/modelCapabilities";
import { useSettings } from "../../settings/preferences/queries";
import { useSpeechModels } from "../../settings/models/models-queries";
import {
  useAddLibraryWatchFolder,
  useLibraryWatchFolders,
  useRemoveLibraryWatchFolder,
  useScanLibraryWatchFolders,
} from "../queries";

// Las carpetas vigiladas son una preferencia, no contenido: viven en Settings
// aunque su efecto se vea en Meetings.
const WatchFoldersSetting = ({ isActive = true }: { isActive?: boolean }) => {
  const { t } = useLingui();
  const { data: watchFolders = [] } = useLibraryWatchFolders(isActive);
  const { data: speechModels = [] } = useSpeechModels(isActive);
  const { data: defaultModelKey = "" } = useSettings(
    (settings) => settings.local_model,
    isActive,
  );
  const addWatchFolder = useAddLibraryWatchFolder();
  const removeWatchFolder = useRemoveLibraryWatchFolder();
  const scanWatchFolders = useScanLibraryWatchFolders();

  const defaultSpeechModelKey = useMemo(() => {
    const installed = speechModels.filter((model) => model.installed);
    const usable = installed.filter(
      (model) =>
        model.remote || hasModelCapability(model, MODEL_CAPABILITY_TIMESTAMPS),
    );
    return (
      usable.find((model) => model.key === defaultModelKey)?.id ??
      usable.find((model) => !model.remote)?.id ??
      usable.find((model) => model.remote)?.id
    );
  }, [speechModels, defaultModelKey]);

  const handleAdd = async () => {
    if (!defaultSpeechModelKey) return;
    try {
      const selection = await open({ directory: true, multiple: false });
      if (!selection || Array.isArray(selection)) return;
      await addWatchFolder.mutateAsync({
        path: selection,
        options: {
          store_original: true,
          model_key: defaultSpeechModelKey,
          llm_cleanup_enabled: false,
          denoise_enabled: false,
          show_timestamps: false,
          detect_speakers: false,
        },
      });
    } catch (err) {
      showLibraryErrorToast(
        err instanceof Error
          ? err.message
          : t({
              id: "library.watch.add_failed",
              message: "Could not add the watch folder.",
            }),
      ).catch(() => {});
    }
  };

  return (
    <div className="rounded-lg bg-surface-surface px-2.5 py-2">
      <div className="flex items-start justify-between gap-4">
        <span className="min-w-0">
          <span className="block ui-text-label-strong ui-color-primary">
            {t({ id: "library.watch.add", message: "Watch folder" })}
          </span>
          <span className="mt-0.5 block ui-text-meta ui-color-muted">
            {t({
              id: "library.watch.add_description",
              message: "Automatically import new audio and video files",
            })}
          </span>
        </span>
        <button
          type="button"
          onClick={handleAdd}
          disabled={!defaultSpeechModelKey || addWatchFolder.isPending}
          className="flex shrink-0 items-center gap-2 whitespace-nowrap rounded-lg border border-border-primary bg-surface-surface px-3 py-1.5 ui-text-body-sm ui-color-primary transition-colors hover:border-border-secondary hover:bg-surface-elevated disabled:opacity-50"
        >
          <FolderSimplePlus size={14} />
          {t({ id: "library.watch.add_action", message: "Add folder" })}
        </button>
      </div>

      {watchFolders.length > 0 ? (
        <div className="mt-2.5 flex flex-wrap items-center gap-2 rounded-lg border border-border-primary bg-surface-secondary px-3 py-2">
          <span className="ui-text-micro ui-color-muted">
            {t({ id: "library.watch.active", message: "Watching" })}
          </span>
          {watchFolders.map((folder) => {
            const parts = folder.path.split(/[\\/]/).filter(Boolean);
            const name = parts[parts.length - 1];
            return (
              <span
                key={folder.path}
                title={folder.path}
                className="inline-flex max-w-64 items-center gap-1 rounded-md border border-border-primary bg-surface-surface px-2 py-1 ui-text-micro ui-color-secondary"
              >
                <span className="truncate">{name || folder.path}</span>
                <button
                  type="button"
                  aria-label={t({
                    id: "library.watch.remove",
                    message: "Stop watching folder",
                  })}
                  onClick={() => removeWatchFolder.mutate(folder.path)}
                  className="ui-color-muted hover:ui-color-primary"
                >
                  <X size={12} />
                </button>
              </span>
            );
          })}
          <button
            type="button"
            onClick={() => scanWatchFolders.mutate()}
            disabled={scanWatchFolders.isPending}
            className="ml-auto inline-flex items-center gap-1 rounded-md px-2 py-1 ui-text-micro ui-color-muted hover:bg-surface-overlay hover:ui-color-primary disabled:opacity-50"
          >
            <ArrowsClockwise
              size={12}
              className={scanWatchFolders.isPending ? "animate-spin" : ""}
            />
            {t({ id: "library.watch.scan", message: "Scan now" })}
          </button>
        </div>
      ) : null}
    </div>
  );
};

export default WatchFoldersSetting;
