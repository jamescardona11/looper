import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { browserStorageUploader, uploadToStorage } from "./upload";

// Controllable fake XMLHttpRequest. The test sets the scenario; send() then
// drives the progress + load/error events on a microtask so the Promise settles.
type Scenario = { status: number; body: string; network?: "fail" };
let scenario: Scenario;
let lastSent: { url: string; headers: Record<string, string>; body: unknown } | null;

class FakeXHR {
  status = 0;
  responseText = "";
  private url = "";
  private headers: Record<string, string> = {};
  private listeners: Record<string, (e?: unknown) => void> = {};
  upload = {
    listeners: {} as Record<string, (e: unknown) => void>,
    addEventListener(type: string, cb: (e: unknown) => void) {
      this.listeners[type] = cb;
    },
  };
  addEventListener(type: string, cb: (e?: unknown) => void) {
    this.listeners[type] = cb;
  }
  open(_method: string, url: string) {
    this.url = url;
  }
  setRequestHeader(key: string, value: string) {
    this.headers[key] = value;
  }
  send(body: unknown) {
    lastSent = { url: this.url, headers: this.headers, body };
    queueMicrotask(() => {
      this.upload.listeners.progress?.({ lengthComputable: true, loaded: 50, total: 100 });
      this.upload.listeners.progress?.({ lengthComputable: true, loaded: 100, total: 100 });
      if (scenario.network === "fail") {
        this.listeners.error?.();
        return;
      }
      this.status = scenario.status;
      this.responseText = scenario.body;
      this.listeners.load?.();
    });
  }
}

beforeEach(() => {
  scenario = { status: 200, body: JSON.stringify({ storageId: "kg_abc123" }) };
  lastSent = null;
  vi.stubGlobal("XMLHttpRequest", FakeXHR);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("uploadToStorage", () => {
  it("POSTs the blob and resolves with the storageId", async () => {
    const file = new Blob(["hi"], { type: "text/plain" });
    const id = await uploadToStorage("https://upload.example/abc", file);
    expect(id).toBe("kg_abc123");
    expect(lastSent?.url).toBe("https://upload.example/abc");
    expect(lastSent?.body).toBe(file);
  });

  it("defaults Content-Type to the blob's own type", async () => {
    await uploadToStorage("https://upload.example/abc", new Blob([""], { type: "audio/webm" }));
    expect(lastSent?.headers["Content-Type"]).toBe("audio/webm");
  });

  it("honors an explicit contentType override (preserving per-site fallbacks)", async () => {
    await uploadToStorage("https://upload.example/abc", new Blob([""]), {
      contentType: "audio/mpeg",
    });
    expect(lastSent?.headers["Content-Type"]).toBe("audio/mpeg");
  });

  it("reports progress as an integer percentage", async () => {
    const onProgress = vi.fn();
    await uploadToStorage("https://upload.example/abc", new Blob([""]), { onProgress });
    expect(onProgress).toHaveBeenCalledWith(50);
    expect(onProgress).toHaveBeenCalledWith(100);
  });

  it("rejects on a non-2xx status", async () => {
    scenario = { status: 500, body: "" };
    await expect(uploadToStorage("https://upload.example/abc", new Blob([""]))).rejects.toThrow(
      "Upload failed: HTTP 500",
    );
  });

  it("rejects on a network error", async () => {
    scenario = { status: 0, body: "", network: "fail" };
    await expect(uploadToStorage("https://upload.example/abc", new Blob([""]))).rejects.toThrow(
      "Network error during upload",
    );
  });

  it("rejects when the response is not valid JSON", async () => {
    scenario = { status: 200, body: "<html>not json</html>" };
    await expect(uploadToStorage("https://upload.example/abc", new Blob([""]))).rejects.toThrow(
      "invalid JSON",
    );
  });
});

describe("browserStorageUploader", () => {
  it("POSTs the seam's file with its type and returns storageId + sizeBytes", async () => {
    const file = new Blob(["hi!"], { type: "text/plain" });
    const onProgress = vi.fn();

    const result = await browserStorageUploader({
      uploadUrl: "https://upload.example/abc",
      file,
      type: "audio/webm",
      onProgress,
    });

    expect(result).toEqual({ storageId: "kg_abc123", sizeBytes: file.size });
    expect(lastSent?.url).toBe("https://upload.example/abc");
    expect(lastSent?.headers["Content-Type"]).toBe("audio/webm");
    expect(lastSent?.body).toBe(file);
    expect(onProgress).toHaveBeenCalledWith(100);
  });
});
