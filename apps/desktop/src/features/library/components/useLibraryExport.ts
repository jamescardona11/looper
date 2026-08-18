import { useLingui } from "@lingui/react/macro";
import { useState } from "react";
import { save } from "@tauri-apps/plugin-dialog";
import type { ExportFormat } from "../../../types";
import { showLibraryErrorToast } from "../../../data/library";
import {
  buildLibraryExportDialog,
  classifyLibraryExportFailure,
  completeLibraryExportPath,
  LIBRARY_EXPORT_DIALOG_TITLE,
  LIBRARY_EXPORT_FAILURE_MESSAGES,
  readLibraryExportError,
} from "./library-export-policy";

type UseLibraryExportOptions = {
  itemName: string;
  onExport: (format: ExportFormat, outputPath: string) => Promise<void>;
  onComplete: () => void;
};

export function useLibraryExport({
  itemName,
  onExport,
  onComplete,
}: UseLibraryExportOptions) {
  const { i18n } = useLingui();
  const [isExporting, setIsExporting] = useState(false);

  const handleExport = async (format: ExportFormat) => {
    setIsExporting(true);
    try {
      const dialog = buildLibraryExportDialog(
        itemName,
        format,
        i18n._(LIBRARY_EXPORT_DIALOG_TITLE),
      );
      const selectedPath = await save(dialog);
      if (selectedPath) {
        await onExport(
          format,
          completeLibraryExportPath(selectedPath, format),
        );
      }
    } catch (err) {
      const message = readLibraryExportError(err);
      console.error("Export failed:", message);
      const failureKind = classifyLibraryExportFailure(message);
      const toastMessage =
        failureKind === "other" && message
          ? message
          : i18n._(LIBRARY_EXPORT_FAILURE_MESSAGES[failureKind]);
      showLibraryErrorToast(toastMessage).catch(() => {});
    } finally {
      setIsExporting(false);
      onComplete();
    }
  };

  return { isExporting, handleExport };
}
