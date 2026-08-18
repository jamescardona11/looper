import { keepPreviousData } from "@tanstack/react-query";

import * as importGateway from "../../data/imports";

const IMPORT_CACHE_ROOT = ["import"] as const;

export const importKeys = {
  all: IMPORT_CACHE_ROOT,
  detected: () => [...IMPORT_CACHE_ROOT, "detected"] as const,
  preview: (appId: string) => [...IMPORT_CACHE_ROOT, "preview", appId] as const,
};

export function importableAppsQuery(enabled: boolean) {
  return {
    queryKey: importKeys.detected(),
    queryFn: importGateway.detectImportableApps,
    enabled,
    staleTime: Number.POSITIVE_INFINITY,
  };
}

export function importPreviewQuery(appId: string | null) {
  const selectedId = appId ?? "";
  return {
    queryKey: importKeys.preview(selectedId),
    queryFn: () => importGateway.previewImport(selectedId),
    enabled: selectedId.length > 0,
    staleTime: Number.POSITIVE_INFINITY,
    placeholderData: keepPreviousData,
  };
}
