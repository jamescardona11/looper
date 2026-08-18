import { describe, expect, it } from "vitest";
import {
  getLocalSttMemoryTier,
  normalizeLocalSttProgress,
  toNativeFilePath,
} from "./local-stt-model";

describe("local Parakeet model policy", () => {
  it("does not offer the model on devices below 4 GB", () => {
    expect(getLocalSttMemoryTier(4 * 1024 ** 3 - 1)).toBe("unsupported");
    expect(getLocalSttMemoryTier(4 * 1024 ** 3)).toBe("caution");
    expect(getLocalSttMemoryTier(6 * 1024 ** 3)).toBe("ready");
  });

  it("keeps native paths and download progress valid", () => {
    expect(toNativeFilePath("file:///tmp/audio%20one.m4a")).toBe("/tmp/audio one.m4a");
    expect(normalizeLocalSttProgress(-3)).toBe(0);
    expect(normalizeLocalSttProgress(101.2)).toBe(100);
  });
});
