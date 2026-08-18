import { describe, expect, test } from "vitest";
import { measureFAQScrollEdges } from "./faq-scroll-edges";

describe("FAQ scroll edge policy", () => {
  test("distinguishes the beginning, middle, and end of the viewport", () => {
    expect(
      measureFAQScrollEdges({
        scrollTop: 0,
        clientHeight: 100,
        scrollHeight: 300,
      }),
    ).toEqual({ top: false, bottom: true });
    expect(
      measureFAQScrollEdges({
        scrollTop: 50,
        clientHeight: 100,
        scrollHeight: 300,
      }),
    ).toEqual({ top: true, bottom: true });
    expect(
      measureFAQScrollEdges({
        scrollTop: 200,
        clientHeight: 100,
        scrollHeight: 300,
      }),
    ).toEqual({ top: true, bottom: false });
  });

  test("keeps the one-pixel tolerance used by the visual fades", () => {
    expect(
      measureFAQScrollEdges({
        scrollTop: 1,
        clientHeight: 99,
        scrollHeight: 101,
      }),
    ).toEqual({ top: false, bottom: false });
    expect(
      measureFAQScrollEdges({
        scrollTop: 2,
        clientHeight: 99,
        scrollHeight: 101,
      }),
    ).toEqual({ top: true, bottom: false });
  });
});
