// Convex adapter — the shared blob-intake step of the upload protocol.
//
// Every Web upload runs the same 3-step sequence: mint a one-time upload
// URL (a Convex mutation), POST the bytes, then hand the resulting storageId
// to a domain-specific mutation/action. The POST is the ONLY platform-specific
// piece, and it is delegated to the StorageUploader the app injects through
// <ConvexProvider> (XHR with real progress). Domain hooks call this helper, so
// no screen sees generateUploadUrl or threads the protocol's fields by hand.

import { useCallback } from "react";
import {
  type StorageUploader,
  type StorageUploadResult,
  useConvexBackend,
} from "../../port/provider";

export interface UploadSourceInput {
  blob: Blob;
  type?: string;
  onProgress?: (percent: number) => void;
}

export type UploadToStorage = (
  generateUploadUrl: () => Promise<string>,
  source: UploadSourceInput,
) => Promise<StorageUploadResult>;

// Pure protocol core (steps 1+2), extracted so it can be exercised with a fake
// StorageUploader: the URL must be minted BEFORE the POST, and the source
// fields must reach the uploader intact (blob maps to the seam's `file`).
export async function runUploadProtocol(
  uploader: StorageUploader | undefined,
  generateUploadUrl: () => Promise<string>,
  source: UploadSourceInput,
): Promise<StorageUploadResult> {
  if (!uploader) {
    throw new Error("No storage uploader configured on <ConvexProvider>");
  }
  const uploadUrl = await generateUploadUrl();
  return uploader({
    uploadUrl,
    file: source.blob,
    ...(source.type !== undefined && { type: source.type }),
    ...(source.onProgress !== undefined && { onProgress: source.onProgress }),
  });
}

export function useUploadToStorage(): UploadToStorage {
  const { storageUploader } = useConvexBackend();
  return useCallback(
    (generateUploadUrl, source) => runUploadProtocol(storageUploader, generateUploadUrl, source),
    [storageUploader],
  );
}
