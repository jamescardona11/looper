import { useCallback, useEffect, useMemo, useRef } from "react";
import type { PillStatus } from "../../types";
import {
  defaultDotPalette,
  DOT_GAP,
  drawRestingDots,
  EMPTY_SPECTRUM,
  flashingErrorPainter,
  paintCanvas,
  processingPainter,
  readDotPalette,
  spectrumPainter,
  symbolPainter,
  type DotGrid,
  type DotPalette,
} from "./pill-visualizer-engine";

type VisualizerInput = {
  status: PillStatus;
  expanded: boolean;
  errorFlashing: boolean;
  spectrum: React.MutableRefObject<Uint8Array>;
  lastSpectrumAt: React.MutableRefObject<number>;
  sensitivity: number;
  decay: number;
};

type CanvasTarget = {
  canvas: React.MutableRefObject<HTMLCanvasElement | null>;
  container: React.MutableRefObject<HTMLDivElement | null>;
  grid: React.MutableRefObject<DotGrid>;
  heights: React.MutableRefObject<number[]>;
};

const initialGrid: DotGrid = {
  spacing: DOT_GAP,
  cols: 0,
  rows: 0,
  offsetX: 0,
  offsetY: 0,
};
const initialPalette = defaultDotPalette();

function useCanvasTarget(): CanvasTarget {
  const canvas = useRef<HTMLCanvasElement>(null);
  const container = useRef<HTMLDivElement>(null);
  const grid = useRef(initialGrid);
  const heights = useRef<number[]>([]);
  return useMemo(
    () => ({ canvas, container, grid, heights }),
    [canvas, container, grid, heights],
  );
}

function resizeTarget(target: CanvasTarget, density: number) {
  const canvas = target.canvas.current;
  const container = target.container.current;
  if (!canvas || !container) return;
  const { offsetWidth: width, offsetHeight: height } = container;
  if (width === 0 || height === 0) return;
  canvas.width = Math.round(width * density);
  canvas.height = Math.round(height * density);
  canvas.style.width = `${width}px`;
  canvas.style.height = `${height}px`;
  canvas.getContext("2d")?.setTransform(density, 0, 0, density, 0, 0);
  const columns = Math.floor(width / DOT_GAP);
  const rows = Math.floor(height / DOT_GAP);
  target.grid.current = {
    spacing: DOT_GAP,
    cols: columns,
    rows,
    offsetX: (width - columns * DOT_GAP) / 2,
    offsetY: (height - rows * DOT_GAP) / 2,
  };
  if (target.heights.current.length !== columns) {
    target.heights.current = Array.from({ length: columns }, () => 0);
  }
}

export function usePillVisualizer(input: VisualizerInput) {
  const foreground = useCanvasTarget();
  const background = useCanvasTarget();
  const expandedRef = useRef(input.expanded);
  const frameRequest = useRef<number | null>(null);
  const palette = useRef<DotPalette>(initialPalette);
  const referenceLevel = useRef(0);
  const frameCount = useRef(0);

  const visibleTarget = useCallback(
    () => (expandedRef.current ? background : foreground),
    [background, foreground],
  );
  const paintVisible = useCallback(
    (painter: Parameters<typeof paintCanvas>[3]) => {
      const target = visibleTarget();
      paintCanvas(
        target.canvas.current,
        target.grid.current,
        palette.current,
        painter,
      );
    },
    [visibleTarget],
  );
  const stopAnimation = useCallback(() => {
    if (frameRequest.current === null) return;
    cancelAnimationFrame(frameRequest.current);
    frameRequest.current = null;
  }, []);

  const normalizationFor = useCallback((bins: Uint8Array) => {
    if (bins.length === 0) return 1;
    let peak = 0;
    for (let index = 0; index < bins.length; index += 4) {
      peak = Math.max(peak, bins[index]);
    }
    frameCount.current += 1;
    if (peak > 15) {
      const early = frameCount.current < 30;
      const response =
        peak > referenceLevel.current
          ? early
            ? 0.3
            : 0.1
          : early
            ? 0.05
            : 0.005;
      referenceLevel.current += (peak - referenceLevel.current) * response;
    }
    return 200 / Math.max(referenceLevel.current, 40);
  }, []);

  const drawSpectrum = useCallback(
    (bins: Uint8Array, elapsed: number) => {
      const target = visibleTarget();
      paintCanvas(
        target.canvas.current,
        target.grid.current,
        palette.current,
        spectrumPainter({
          bins,
          elapsed,
          normalization: normalizationFor(bins),
          sensitivity: input.sensitivity,
          decay: input.decay,
          heights: target.heights.current,
        }),
      );
    },
    [input.decay, input.sensitivity, normalizationFor, visibleTarget],
  );

  const actions = useRef({
    spectrum: drawSpectrum,
    process: (elapsed: number) => paintVisible(processingPainter(elapsed)),
    error: (elapsed: number) => paintVisible(flashingErrorPainter(elapsed)),
    rest: () => paintVisible(drawRestingDots),
    symbol: (name: "cross" | "warning", color: string) =>
      paintVisible(symbolPainter(name, color, color)),
  });
  useEffect(() => {
    actions.current = {
      spectrum: drawSpectrum,
      process: (elapsed) => paintVisible(processingPainter(elapsed)),
      error: (elapsed) => paintVisible(flashingErrorPainter(elapsed)),
      rest: () => paintVisible(drawRestingDots),
      symbol: (name, color) => paintVisible(symbolPainter(name, color, color)),
    };
  }, [drawSpectrum, paintVisible]);

  useEffect(() => {
    stopAnimation();
    if (input.status === "idle") {
      actions.current.rest();
      return;
    }
    if (input.status === "listening") {
      referenceLevel.current = 0;
      frameCount.current = 0;
      foreground.heights.current.fill(0);
    }
    let startedAt: number | null = null;
    let running = true;
    const tick = (time: number) => {
      if (!running) return;
      if (startedAt === null) startedAt = time;
      const elapsed = time - startedAt;
      if (input.status === "listening") {
        const bins =
          performance.now() - input.lastSpectrumAt.current > 250
            ? EMPTY_SPECTRUM
            : input.spectrum.current;
        actions.current.spectrum(bins, elapsed);
      } else if (input.status === "processing") {
        actions.current.process(elapsed);
      } else if (input.status === "cancelled") {
        actions.current.symbol("cross", palette.current.highlight);
      } else if (input.status === "error" && input.errorFlashing) {
        actions.current.error(elapsed);
      }
      frameRequest.current = requestAnimationFrame(tick);
    };
    frameRequest.current = requestAnimationFrame(tick);
    return () => {
      running = false;
      stopAnimation();
    };
  }, [
    foreground.heights,
    input.errorFlashing,
    input.lastSpectrumAt,
    input.spectrum,
    input.status,
    stopAnimation,
  ]);

  useEffect(() => {
    if (input.status !== "error" || input.errorFlashing) return;
    stopAnimation();
    actions.current.symbol("warning", palette.current.error);
  }, [input.errorFlashing, input.status, stopAnimation]);

  useEffect(() => {
    expandedRef.current = input.expanded;
    if (input.status === "idle") actions.current.rest();
    else if (input.status === "error" && !input.errorFlashing) {
      actions.current.symbol("warning", palette.current.error);
    }
  }, [input.errorFlashing, input.expanded, input.status]);

  const resize = useCallback(() => {
    palette.current = readDotPalette();
    const density = window.devicePixelRatio || 1;
    resizeTarget(foreground, density);
    resizeTarget(background, density);
    if (input.status === "idle") actions.current.rest();
  }, [background, foreground, input.status]);

  useEffect(() => {
    palette.current = readDotPalette();
  }, []);
  useEffect(() => {
    const observer = new ResizeObserver(resize);
    if (foreground.container.current) {
      observer.observe(foreground.container.current);
    }
    if (background.container.current) {
      observer.observe(background.container.current);
    }
    resize();
    return () => observer.disconnect();
  }, [background.container, foreground.container, resize]);

  return {
    canvasRef: foreground.canvas,
    containerRef: foreground.container,
    bgCanvasRef: background.canvas,
    bgContainerRef: background.container,
  };
}
