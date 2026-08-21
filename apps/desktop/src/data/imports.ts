import { invoke } from "@tauri-apps/api/core";
import type {
  DetectedApp,
  ImportPreview,
  ImportResult,
  ImportSelections,
} from "../contracts";

export function detectImportableApps(): Promise<DetectedApp[]> {
  return invoke("detect_importable_apps");
}

export function previewImport(id: string): Promise<ImportPreview> {
  return invoke("preview_import", { id });
}

export function applyImport(
  id: string,
  selections: ImportSelections,
): Promise<ImportResult> {
  return invoke("apply_import", { id, selections });
}
