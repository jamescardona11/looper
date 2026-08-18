import type { MessageDescriptor } from "@lingui/core";
import { msg } from "@lingui/core/macro";

import type { ExportFormat } from "../../../types";
import { sanitizeFileName } from "./library-utils";

export type LibraryExportFailureKind =
  | "timestamps"
  | "write"
  | "missing-item"
  | "other";

export const LIBRARY_EXPORT_DIALOG_TITLE = msg({
  id: "library.modal.export.title",
  message: "Export transcription",
});

export const LIBRARY_EXPORT_FAILURE_MESSAGES: Record<
  LibraryExportFailureKind,
  MessageDescriptor
> = {
  timestamps: msg({
    id: "library.modal.export.no_timestamps",
    message:
      "This item doesn't have timestamps. Retranscribe with timestamps to export subtitles.",
  }),
  write: msg({
    id: "library.modal.export.write_failed",
    message: "Couldn't write the export file. Try a different location.",
  }),
  "missing-item": msg({
    id: "library.modal.export.item_not_found",
    message: "Couldn't find this library item. Try reopening it.",
  }),
  other: msg({
    id: "library.modal.export.failed",
    message: "Export failed. Try again.",
  }),
};

export function buildLibraryExportDialog(
  itemName: string,
  format: ExportFormat,
  title: string,
) {
  const baseName = sanitizeFileName(itemName).trim() || "transcript";

  return {
    title,
    defaultPath: [baseName, format].join("."),
    filters: [
      {
        name: format.toUpperCase(),
        extensions: [format],
      },
    ],
  };
}

export function completeLibraryExportPath(
  selectedPath: string,
  format: ExportFormat,
) {
  const hasExpectedSuffix = selectedPath
    .toLowerCase()
    .endsWith(`.${format}`);
  return hasExpectedSuffix ? selectedPath : `${selectedPath}.${format}`;
}

export function readLibraryExportError(reason: unknown) {
  return reason instanceof Error ? reason.message : String(reason);
}

export function classifyLibraryExportFailure(
  message: string,
): LibraryExportFailureKind {
  const normalized = message.toLowerCase();

  if (normalized.includes("no timestamp segments")) return "timestamps";
  if (normalized.includes("failed to write export file")) return "write";
  if (normalized.includes("library item not found")) return "missing-item";
  return "other";
}
