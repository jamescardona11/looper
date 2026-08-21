import { describe, expect, test } from "vitest";
import { buildSecurityDots, buildStripeDots } from "../member-card-dot-pattern";
import {
  getCardContentHeight,
  getCardShellStyle,
  getMemberCardHeight,
} from "../member-card-geometry";
import { MEMBER_CARD_LIGHT_PALETTE } from "../member-card-palette";

describe("member card visual policy", () => {
  test("keeps the fixed card dimensions and shell transform", () => {
    const shell = getCardShellStyle(MEMBER_CARD_LIGHT_PALETTE);

    expect(getCardContentHeight()).toBe(237);
    expect(getMemberCardHeight()).toBe(257);
    expect(shell).toEqual({
      width: "400px",
      height: "257px",
      minHeight: "257px",
      maxHeight: "257px",
      backgroundColor: "var(--member-card-light-bg)",
      border: "none",
      borderRadius: "8px",
      boxShadow: "var(--member-card-light-shadow)",
      transform: "rotate(-0.65deg)",
      transformOrigin: "center center",
    });
  });

  test("keeps the deterministic security-paper grid", () => {
    const dots = buildSecurityDots("draft-looper", 257);

    expect(dots).toHaveLength(1_232);
    expect(dots.filter((dot) => dot.active)).toHaveLength(89);
    expect(dots.slice(0, 3)).toEqual([
      { x: 5.5, y: 5.5, active: false },
      { x: 14.5, y: 5.5, active: false },
      { x: 23.5, y: 5.5, active: true },
    ]);
    expect(dots.at(-1)).toEqual({ x: 392.5, y: 248.5, active: false });
  });

  test("keeps the clipped stripe geometry and density", () => {
    const dots = buildStripeDots("draft-looper", 0.26);

    expect(dots).toHaveLength(475);
    expect(dots.filter((dot) => dot.active)).toHaveLength(129);
    expect(dots.slice(0, 3)).toEqual([
      { x: 1.5, y: 5.5, active: false },
      { x: 7.5, y: 5.5, active: true },
      { x: 13.5, y: 5.5, active: false },
    ]);
    expect(dots.slice(-3)).toEqual([
      { x: 393, y: 45, active: false },
      {
        x: 396.53553390593277,
        y: 43.53553390593274,
        active: false,
      },
      { x: 398, y: 40, active: true },
    ]);
  });
});
