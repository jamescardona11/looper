import { describe, expect, test } from "vitest";
import {
  parseTextSizeMode,
  resolveTextScale,
  TEXT_SIZE_MODE_STORAGE_KEY,
} from "./textSize";

describe("text size", () => {
  test("keeps the Looper storage namespace", () => {
    expect(TEXT_SIZE_MODE_STORAGE_KEY).toBe("looper_text_size_mode");
  });

  test("falls back to the default mode for invalid storage values", () => {
    expect(parseTextSizeMode(null)).toBe("default");
    expect(parseTextSizeMode("medium")).toBe("default");
    expect(parseTextSizeMode("large")).toBe("large");
  });

  test("uses the Windows scale curve", () => {
    expect(resolveTextScale("small", "windows")).toBe("1");
    expect(resolveTextScale("default", "windows")).toBe("1.0625");
    expect(resolveTextScale("large", "windows")).toBe("1.125");
  });

  test("uses the standard scale curve on other platforms", () => {
    expect(resolveTextScale("small", "macos")).toBe("0.94");
    expect(resolveTextScale("default")).toBe("1");
    expect(resolveTextScale("large", "unsupported")).toBe("1.08");
  });
});
