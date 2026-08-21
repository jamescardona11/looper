import { describe, expect, test } from "vitest";
import {
  isVisibleOverlayPosition,
  parseOverlayPosition,
} from "../overlay-position";

describe("overlay position", () => {
  test("restores only finite coordinates", () => {
    expect(parseOverlayPosition('{"x":120,"y":80}')).toEqual({
      x: 120,
      y: 80,
    });
    expect(parseOverlayPosition('{"x":"120","y":80}')).toBeNull();
    expect(parseOverlayPosition('{"x":1e999,"y":80}')).toBeNull();
    expect(parseOverlayPosition("malformed")).toBeNull();
    expect(parseOverlayPosition(null)).toBeNull();
  });

  test("rejects the native offscreen hiding sentinel", () => {
    expect(isVisibleOverlayPosition({ x: 0, y: 0 })).toBe(true);
    expect(isVisibleOverlayPosition({ x: -5_000, y: 100 })).toBe(false);
    expect(isVisibleOverlayPosition({ x: 100, y: -5_001 })).toBe(false);
  });
});
