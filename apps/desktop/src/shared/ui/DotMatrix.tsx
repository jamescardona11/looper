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

type MatrixDotProps = {
  index: number;
  active: boolean;
  animated: boolean;
  morphOnActive: boolean;
  size: number;
  color: string;
  scale: number;
  transition: string;
};

function MatrixDot({
  index,
  active,
  animated,
  morphOnActive,
  size,
  color,
  scale,
  transition,
}: MatrixDotProps) {
  const style: CSSProperties = {
    width: size,
    height: size,
    backgroundColor: color,
    opacity: active ? 1 : 0.15,
    borderRadius: active && morphOnActive ? size * 0.25 : "50%",
    transform: `scale(${active ? scale : 1})`,
    transition,
  };

  if (!animated) return <div style={style} />;

  return (
    <motion.div
      style={style}
      {...(active && !morphOnActive
        ? {
            initial: { scale: 0.8, opacity: 0 },
            animate: { scale: 1, opacity: 1 },
            transition: { delay: index * 0.002, duration: 0.2 },
          }
        : {})}
    />
  );
}

function DotMatrix({
  rows = 5,
  cols = 20,
  activeDots = [],
  className = "",
  dotSize = 2,
  gap = 4,
  color = "currentColor",
  animated = false,
  morphOnActive = false,
  activeScale = 1,
  snapDots = false,
  ...rest
}: DotMatrixProps) {
  const activeIndexes = new Set(activeDots);
  const dotTransition = snapDots
    ? "none"
    : "border-radius 0.4s ease-out, opacity 0.3s ease-out, transform 0.4s cubic-bezier(0.175, 0.885, 0.32, 1.275)";

  return (
    <div
      className={`grid place-items-center ${className}`}
      style={{
        gridTemplateColumns: `repeat(${cols}, ${dotSize}px)`,
        gap,
        width: "fit-content",
      }}
      {...rest}
    >
      {Array.from({ length: rows * cols }, (_, index) => (
        <MatrixDot
          key={index}
          index={index}
          active={activeIndexes.has(index)}
          animated={animated}
          morphOnActive={morphOnActive}
          size={dotSize}
          color={color}
          scale={activeScale}
          transition={dotTransition}
        />
      ))}
    </div>
  );
}

export default memo(DotMatrix);
