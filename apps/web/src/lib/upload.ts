// Browser transport for Storage Upload: POST a Blob/File to a presigned backend
// URL via XHR (the only browser API that reports upload progress) and read back
// its storageId. `browserStorageUploader` is the StorageUploader adapter the app
// injects into <ConvexProvider> — the 3-step upload protocol itself lives in the
// @looper/data hooks.

import type { StorageUploader } from "@looper/data";

export interface UploadOptions {
  /** Content-Type header for the upload. Defaults to the blob's own type. */
  contentType?: string;
  /** Receives upload progress as an integer percentage (0–100). */
  onProgress?: (percent: number) => void;
}

// Returns the raw storageId string. Rejects on non-2xx status, network failure,
// or a non-JSON response.
export function uploadToStorage(
  uploadUrl: string,
  file: Blob,
  opts: UploadOptions = {},
): Promise<string> {
  const contentType = opts.contentType ?? file.type;
  return new Promise<string>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    if (opts.onProgress) {
      xhr.upload.addEventListener("progress", (e) => {
        if (e.lengthComputable) opts.onProgress?.(Math.round((e.loaded / e.total) * 100));
      });
    }
    xhr.addEventListener("load", () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        try {
          const { storageId } = JSON.parse(xhr.responseText) as { storageId: string };
          resolve(storageId);
        } catch {
          reject(new Error("Upload succeeded but returned invalid JSON"));
        }
      } else {
        reject(new Error(`Upload failed: HTTP ${xhr.status}`));
      }
    });
    xhr.addEventListener("error", () => reject(new Error("Network error during upload")));
    xhr.open("POST", uploadUrl);
    if (contentType) xhr.setRequestHeader("Content-Type", contentType);
    xhr.send(file);
  });
}

// The web StorageUploader: wired into <ConvexProvider> in app/providers.tsx.
// sizeBytes is the blob's own size — the exact byte count the XHR POSTs.
export const browserStorageUploader: StorageUploader = async ({
  uploadUrl,
  file,
  type,
  onProgress,
}) => {
  const storageId = await uploadToStorage(uploadUrl, file, {
    ...(type !== undefined && { contentType: type }),
    ...(onProgress !== undefined && { onProgress }),
  });
  return { storageId, sizeBytes: file.size };
};
