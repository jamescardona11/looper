// The consolidated upload protocol (steps 1+2), exercised through the seam with
// a FAKE StorageUploader — no convex/react, no vi.mock of package modules. The
// invariants under test are the ones the old hand-inlined copies kept breaking:
// mint-before-POST ordering and field threading into the uploader.

import { describe, expect, it, vi } from "vitest";
import type { StorageUploader } from "../../../port/provider";
import { runUploadProtocol } from "../upload-protocol";

function fakeUploader(): StorageUploader & ReturnType<typeof vi.fn> {
  return vi.fn(async () => ({ storageId: "store_1", sizeBytes: 1234 }));
}

describe("runUploadProtocol", () => {
  it("mints the upload URL before POSTing (ordering is load-bearing)", async () => {
    const calls: string[] = [];
    const uploader: StorageUploader = vi.fn(async () => {
      calls.push("post");
      return { storageId: "s", sizeBytes: 1 };
    });
    const generateUploadUrl = vi.fn(async () => {
      calls.push("mint");
      return "https://upload.example/abc";
    });

    await runUploadProtocol(uploader, generateUploadUrl, {
      blob: new Blob(["hi"]),
      type: "text/plain",
    });

    expect(calls).toEqual(["mint", "post"]);
    expect(generateUploadUrl).toHaveBeenCalledTimes(1);
  });

  it("threads a web blob source into the uploader (blob maps to the seam's `file`)", async () => {
    const uploader = fakeUploader();
    const blob = new Blob(["hi"], { type: "text/plain" });
    const onProgress = vi.fn();

    const result = await runUploadProtocol(uploader, async () => "https://upload.example/abc", {
      blob,
      type: "audio/webm",
      onProgress,
    });

    expect(uploader).toHaveBeenCalledWith({
      uploadUrl: "https://upload.example/abc",
      file: blob,
      type: "audio/webm",
      onProgress,
    });
    expect(result).toEqual({ storageId: "store_1", sizeBytes: 1234 });
  });

  it("throws when no StorageUploader is configured", async () => {
    await expect(
      runUploadProtocol(undefined, async () => "u", { blob: new Blob([""]), type: "text/plain" }),
    ).rejects.toThrow("No storage uploader configured on <ConvexProvider>");
  });

  it("propagates a mint failure and never POSTs", async () => {
    const uploader = fakeUploader();

    await expect(
      runUploadProtocol(
        uploader,
        async () => {
          throw new Error("mint boom");
        },
        { blob: new Blob([""]), type: "text/plain" },
      ),
    ).rejects.toThrow("mint boom");
    expect(uploader).not.toHaveBeenCalled();
  });

  it("propagates an uploader failure", async () => {
    const uploader: StorageUploader = async () => {
      throw new Error("Upload HTTP 500");
    };

    await expect(
      runUploadProtocol(uploader, async () => "u", { blob: new Blob([""]), type: "text/plain" }),
    ).rejects.toThrow("Upload HTTP 500");
  });
});
