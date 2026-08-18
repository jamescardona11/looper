import { useQuery } from "@tanstack/react-query";

import {
  importableAppsQuery,
  importPreviewQuery,
} from "./import-query-policy";

export { importKeys } from "./import-query-policy";

export function useImportableApps(enabled = true) {
  return useQuery(importableAppsQuery(enabled));
}

export function useImportPreview(appId: string | null) {
  return useQuery(importPreviewQuery(appId));
}
