import { motion } from "framer-motion";
import { memo, type CSSProperties, type HTMLAttributes } from "react";

interface DotMatrixProps extends HTMLAttributes<HTMLDivElement> {
  rows?: number;
  cols?: number;
  activeDots?: readonly number[];
  dotSize?: number;
  gap?: number;
  color?: string;
  animated?: boolean;
  morphOnActive?: boolean;
  activeScale?: number;
  snapDots?: boolean;
}

const MATRIX_DEFAULTS = {
  rows: 5,
  columns: 20,
  size: 2,
  spacing: 4,
  color: "currentColor",
  activeScale: 1,
} as const;

function resolveMatrixProps(props: DotMatrixProps) {
  const {
    rows,
    cols,
    activeDots,
    dotSize,
    gap,
    color,
    animated,
    morphOnActive,
    activeScale,
    snapDots,
    className,
    ...containerProps
  } = props;
  return {
    rows: rows ?? MATRIX_DEFAULTS.rows,
    columns: cols ?? MATRIX_DEFAULTS.columns,
    activeDots: activeDots ?? [],
    size: dotSize ?? MATRIX_DEFAULTS.size,
    spacing: gap ?? MATRIX_DEFAULTS.spacing,
    color: color ?? MATRIX_DEFAULTS.color,
    animated: animated ?? false,
    morph: morphOnActive ?? false,
    scale: activeScale ?? MATRIX_DEFAULTS.activeScale,
    snap: snapDots ?? false,
    className: className ?? "",
    containerProps,
  };
}

type CellView = {
  style: CSSProperties;
  entrance: {
    initial?: { scale: number; opacity: number };
    animate?: { scale: number; opacity: number };
    transition?: { delay: number; duration: number };
  };
};

function cellView(
  index: number,
  active: boolean,
  size: number,
  color: string,
  scale: number,
  transition: string,
  morph: boolean,
): CellView {
  return {
    style: {
      width: size,
      height: size,
      backgroundColor: color,
      opacity: active ? 1 : 0.15,
      borderRadius: active && morph ? size * 0.25 : "50%",
      transform: `scale(${active ? scale : 1})`,
      transition,
    },
    entrance:
      active && !morph
        ? {
            initial: { scale: 0.8, opacity: 0 },
            animate: { scale: 1, opacity: 1 },
            transition: { delay: index * 0.002, duration: 0.2 },
          }
        : {},
  };
}

function MatrixCell({
  index,
  active,
  animated,
  size,
  color,
  scale,
  transition,
  morph,
}: {
  index: number;
  active: boolean;
  animated: boolean;
  size: number;
  color: string;
  scale: number;
  transition: string;
  morph: boolean;
}) {
  const view = cellView(index, active, size, color, scale, transition, morph);
  return animated ? (
    <motion.div style={view.style} {...view.entrance} />
  ) : (
    <div style={view.style} />
  );
}

function DotMatrix(props: DotMatrixProps) {
  const matrix = resolveMatrixProps(props);
  const selected = new Set(matrix.activeDots);
  const transition = matrix.snap
    ? "none"
    : "border-radius 0.4s ease-out, opacity 0.3s ease-out, transform 0.4s cubic-bezier(0.175, 0.885, 0.32, 1.275)";
  const layout = {
    gridTemplateColumns: `repeat(${matrix.columns}, ${matrix.size}px)`,
    gap: matrix.spacing,
    width: "fit-content",
  };

  return (
    <div
      className={`grid place-items-center ${matrix.className}`}
      style={layout}
      {...matrix.containerProps}
    >
      {Array.from({ length: matrix.rows * matrix.columns }, (_, index) => (
        <MatrixCell
          key={index}
          index={index}
          active={selected.has(index)}
          animated={matrix.animated}
          size={matrix.size}
          color={matrix.color}
          scale={matrix.scale}
          transition={transition}
          morph={matrix.morph}
        />
      ))}
    </div>
  );
}

export default memo(DotMatrix);
