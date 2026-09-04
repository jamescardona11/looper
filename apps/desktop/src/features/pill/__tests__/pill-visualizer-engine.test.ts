import { describe, expect, it, vi } from "vitest";
import {
  defaultDotPalette,
  spectrumPainter,
  type DotGrid,
} from "../pill-visualizer-engine";

const grid: DotGrid = {
  spacing: 3,
  cols: 9,
  rows: 9,
  offsetX: 0,
  offsetY: 0,
};

function drawSpectrum(bins: Uint8Array, heights: number[]) {
  const fillStyles: string[] = [];
  const context = {
    beginPath: vi.fn(),
    arc: vi.fn(),
    fill: vi.fn(),
    shadowBlur: 0,
    shadowColor: "transparent",
    set fillStyle(value: string) {
      fillStyles.push(value);
    },
  } as unknown as CanvasRenderingContext2D;

  spectrumPainter({
    bins,
    normalization: 1,
    sensitivity: 1,
    decay: 0.85,
    heights,
  })(context, 27, 27, grid, defaultDotPalette());

  return fillStyles;
}

describe("spectrumPainter", () => {
  it("does not invent an active waveform when the audio spectrum is silent", () => {
    const fillStyles = drawSpectrum(new Uint8Array(256), Array(9).fill(0));

    expect(fillStyles).not.toContainEqual(expect.stringContaining("255, 255, 255"));
  });

  it("lets a stale spectrum decay instead of holding its last waveform", () => {
    const heights = Array(9).fill(0.8);

    drawSpectrum(new Uint8Array(0), heights);

    expect(heights).toEqual(Array(9).fill(0.68));
  });
});
