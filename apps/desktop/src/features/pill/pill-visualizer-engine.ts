export type DotGrid = {
  spacing: number;
  cols: number;
  rows: number;
  offsetX: number;
  offsetY: number;
};

export type DotPalette = {
  base: string;
  highlight: string;
  error: string;
};

export const DOT_GAP = 3;
export const EMPTY_SPECTRUM = new Uint8Array(0);

const dotSize = { base: 0.9, icon: 1.2, wave: 1, loader: 1 };
const fallbackPalette: DotPalette = {
  base: "40, 40, 40",
  highlight: "255, 255, 255",
  error: "239, 68, 68",
};
const symbolPixels = {
  cross: [
    [1, 0, 0, 0, 1],
    [0, 1, 0, 1, 0],
    [0, 0, 1, 0, 0],
    [0, 1, 0, 1, 0],
    [1, 0, 0, 0, 1],
  ],
  warning: [
    [0, 0, 1, 0, 0],
    [0, 0, 1, 0, 0],
    [0, 0, 1, 0, 0],
    [0, 0, 0, 0, 0],
    [0, 0, 1, 0, 0],
  ],
};

export type VisualizerSymbol = keyof typeof symbolPixels;
type FramePainter = (
  context: CanvasRenderingContext2D,
  width: number,
  height: number,
  grid: DotGrid,
  palette: DotPalette,
) => void;

function cssChannel(variable: string, fallback: string) {
  if (typeof window === "undefined") return fallback;
  return (
    getComputedStyle(document.documentElement)
      .getPropertyValue(variable)
      .trim() || fallback
  );
}

export function readDotPalette(): DotPalette {
  return {
    base: cssChannel("--ui-pill-dot-base-rgb", fallbackPalette.base),
    highlight: cssChannel(
      "--ui-pill-dot-highlight-rgb",
      fallbackPalette.highlight,
    ),
    error: cssChannel("--ui-pill-dot-error-rgb", fallbackPalette.error),
  };
}

export function defaultDotPalette() {
  return fallbackPalette;
}

export function paintCanvas(
  canvas: HTMLCanvasElement | null,
  grid: DotGrid,
  palette: DotPalette,
  painter: FramePainter,
) {
  if (!canvas) return;
  const context = canvas.getContext("2d");
  if (!context) return;
  const density = window.devicePixelRatio || 1;
  context.shadowBlur = 0;
  context.shadowColor = "transparent";
  context.clearRect(0, 0, canvas.width, canvas.height);
  painter(
    context,
    canvas.width / density,
    canvas.height / density,
    grid,
    palette,
  );
}

function capsuleOpacity(x: number, y: number, width: number, height: number) {
  const radius = height / 2;
  const centerY = radius;
  let edgeDistance: number;
  if (x < radius) {
    edgeDistance = radius - Math.hypot(x - radius, y - centerY);
  } else if (x > width - radius) {
    edgeDistance = radius - Math.hypot(x - (width - radius), y - centerY);
  } else {
    edgeDistance = Math.min(y, height - y);
  }
  return Math.min(1, Math.max(0, edgeDistance / 15));
}

function visitDots(
  grid: DotGrid,
  visitor: (column: number, row: number, x: number, y: number) => void,
) {
  const { cols, rows, spacing, offsetX, offsetY } = grid;
  for (let column = 0; column < cols; column += 1) {
    for (let row = 0; row < rows; row += 1) {
      visitor(
        column,
        row,
        offsetX + column * spacing + spacing / 2,
        offsetY + row * spacing + spacing / 2,
      );
    }
  }
}

function symbolContains(
  symbol: VisualizerSymbol,
  column: number,
  row: number,
  grid: DotGrid,
) {
  const pixels = symbolPixels[symbol];
  const localColumn =
    column - (Math.floor(grid.cols / 2) - Math.floor(pixels[0].length / 2));
  const localRow =
    row - (Math.floor(grid.rows / 2) - Math.floor(pixels.length / 2));
  return pixels[localRow]?.[localColumn] === 1;
}

export const drawRestingDots: FramePainter = (
  context,
  width,
  height,
  grid,
  palette,
) => {
  visitDots(grid, (_column, _row, x, y) => {
    const alpha = capsuleOpacity(x, y, width, height);
    if (alpha <= 0.05) return;
    context.beginPath();
    context.fillStyle = `rgba(${palette.base}, ${alpha})`;
    context.arc(x, y, dotSize.base, 0, Math.PI * 2);
    context.fill();
  });
};

export function processingPainter(elapsed: number): FramePainter {
  return (context, width, height, grid, palette) => {
    const pulse = 0.5 + 0.5 * Math.sin(elapsed * 0.001);
    const wavelength = grid.cols * 0.4;
    visitDots(grid, (column, _row, x, y) => {
      const alpha = capsuleOpacity(x, y, width, height);
      if (alpha <= 0.05) return;
      const centerDistance = Math.abs(y - height / 2);
      const phase = column / wavelength - elapsed * 0.0015;
      const wave = Math.sin(phase * Math.PI * 2) * 0.5 + 0.5;
      const activeRadius = wave * height * 0.4 * (0.6 + 0.4 * pulse);
      const active = centerDistance < activeRadius;
      context.beginPath();
      if (active) {
        const edge = 1 - centerDistance / (activeRadius + 0.5);
        const brightness = Math.pow(edge, 1.5) * (0.7 + 0.3 * wave);
        context.fillStyle = `rgba(${palette.highlight}, ${brightness * alpha})`;
        if (brightness > 0.7) {
          context.shadowBlur = 3;
          context.shadowColor = `rgba(${palette.highlight}, 0.3)`;
        }
        context.arc(x, y, dotSize.loader, 0, Math.PI * 2);
      } else {
        context.fillStyle = `rgba(${palette.base}, ${alpha * 0.4})`;
        context.arc(x, y, dotSize.base, 0, Math.PI * 2);
      }
      context.fill();
      if (active) {
        context.shadowBlur = 0;
        context.shadowColor = "transparent";
      }
    });
  };
}

export function flashingErrorPainter(elapsed: number): FramePainter {
  return (context, width, height, grid, palette) => {
    const flash = Math.sin(elapsed * 0.02 * Math.PI * 2);
    const intensity = 0.5 + 0.5 * Math.max(0, flash);
    visitDots(grid, (column, row, x, y) => {
      const alpha = capsuleOpacity(x, y, width, height);
      if (alpha <= 0.05) return;
      const highlighted = symbolContains("warning", column, row, grid);
      context.beginPath();
      if (highlighted) {
        context.fillStyle = `rgba(${palette.error}, ${alpha})`;
        context.shadowBlur = 6;
        context.shadowColor = `rgba(${palette.error}, 0.6)`;
        context.arc(x, y, dotSize.icon, 0, Math.PI * 2);
      } else {
        context.fillStyle = `rgba(${palette.error}, ${intensity * alpha * 0.6})`;
        context.shadowBlur = 0;
        context.shadowColor = "transparent";
        context.arc(x, y, dotSize.base, 0, Math.PI * 2);
      }
      context.fill();
    });
  };
}

export function symbolPainter(
  symbol: VisualizerSymbol,
  color: string,
  glow?: string,
): FramePainter {
  return (context, width, height, grid, palette) => {
    visitDots(grid, (column, row, x, y) => {
      const alpha = capsuleOpacity(x, y, width, height);
      if (alpha <= 0.05) return;
      const highlighted = symbolContains(symbol, column, row, grid);
      context.beginPath();
      if (highlighted) {
        context.fillStyle = `rgba(${color}, ${alpha})`;
        context.shadowBlur = glow ? 8 : 0;
        context.shadowColor = glow ? `rgba(${glow}, 0.5)` : "transparent";
        context.arc(x, y, dotSize.icon, 0, Math.PI * 2);
      } else {
        context.fillStyle = `rgba(${palette.base}, ${alpha})`;
        context.shadowBlur = 0;
        context.shadowColor = "transparent";
        context.arc(x, y, dotSize.base, 0, Math.PI * 2);
      }
      context.fill();
    });
  };
}

type SpectrumPainterInput = {
  bins: Uint8Array;
  elapsed: number;
  normalization: number;
  sensitivity: number;
  decay: number;
  heights: number[];
};

export function spectrumPainter(input: SpectrumPainterInput): FramePainter {
  return (context, width, height, grid, palette) => {
    const center = Math.floor(grid.cols / 2);
    if (input.bins.length > 0) {
      for (let distance = 0; distance <= center; distance += 1) {
        const proportion = distance / center;
        const index = Math.floor(
          input.bins.length * 0.4 * proportion * proportion,
        );
        const neighbor = input.bins[index + 1];
        const sample = neighbor
          ? ((input.bins[index] || 0) + neighbor) / 2
          : input.bins[index] || 0;
        let amplitude =
          ((sample * input.normalization) / 255) * input.sensitivity;
        if (proportion < 0.2) amplitude *= 1.25;
        const reduceMotion =
          window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ??
          false;
        const ambient = reduceMotion
          ? 0.1
          : 0.08 +
            0.09 *
              (0.5 + 0.5 * Math.sin(input.elapsed * 0.006 + proportion * 8));
        amplitude = Math.min(
          1,
          Math.max(amplitude, ambient * (1 - proportion * 0.45)),
        );
        const left = center - distance;
        if (left >= 0 && left < grid.cols) {
          const current = input.heights[left];
          const response = amplitude > current ? 0.5 : 1 - input.decay;
          input.heights[left] += (amplitude - current) * response;
        }
        const right = center + distance;
        if (right < grid.cols && right !== left) {
          input.heights[right] = input.heights[left];
        }
      }
    }

    visitDots(grid, (column, _row, x, y) => {
      const alpha = capsuleOpacity(x, y, width, height);
      if (alpha <= 0.05) return;
      const radius = (input.heights[column] || 0) * height * 0.45;
      const centerDistance = Math.abs(y - height / 2);
      const active = radius > 0.5 && centerDistance < radius;
      context.beginPath();
      if (active) {
        const brightness = 0.5 + (1 - centerDistance / (radius + 0.1)) * 0.5;
        context.fillStyle = `rgba(${palette.highlight}, ${brightness * alpha})`;
        context.shadowBlur = brightness > 0.8 ? 4 : 0;
        context.shadowColor =
          brightness > 0.8 ? `rgba(${palette.highlight}, 0.4)` : "transparent";
        context.arc(x, y, dotSize.wave, 0, Math.PI * 2);
      } else {
        context.fillStyle = `rgba(${palette.base}, ${alpha})`;
        context.shadowBlur = 0;
        context.shadowColor = "transparent";
        context.arc(x, y, dotSize.base, 0, Math.PI * 2);
      }
      context.fill();
    });
  };
}
