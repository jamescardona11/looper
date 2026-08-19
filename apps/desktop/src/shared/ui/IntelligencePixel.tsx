import { motion } from "framer-motion";

interface IntelligencePixelProps {
  active: boolean;
  statusType?: string;
  size?: "sm" | "md" | "lg";
  className?: string;
}

const GEOMETRY = {
  sm: ["w-[10px] h-[10px] gap-[2px]", "w-[4px] h-[4px] rounded-[1px]"],
  md: ["w-[20px] h-[20px] gap-[4px]", "w-[8px] h-[8px] rounded-[2px]"],
  lg: ["w-[40px] h-[40px] gap-[8px]", "w-[16px] h-[16px] rounded-[4px]"],
} as const;
const CELLS = [0, 1, 2, 3] as const;

function cellView(
  geometry: (typeof GEOMETRY)[keyof typeof GEOMETRY],
  status: string,
  active: boolean,
  index: number,
) {
  const color =
    status === "error"
      ? "bg-[var(--color-error)]"
      : active
        ? "bg-[var(--color-accent)] shadow-[0_0_8px_var(--color-accent-30)]"
        : "bg-[var(--color-text-muted)]";
  return {
    className: `${geometry[1]} ${color}`,
    animate: active
      ? { opacity: [0.4, 1, 0.4], scale: [0.9, 1.1, 0.9] }
      : { opacity: status === "complete" ? 0.8 : 0.3, scale: 1 },
    transition: active
      ? {
          duration: 1.5,
          repeat: Infinity,
          delay: index * 0.2,
          ease: "easeInOut" as const,
        }
      : { duration: 0.3 },
  };
}

export function IntelligencePixel(props: IntelligencePixelProps) {
  const active = props.active;
  const statusType = props.statusType ?? "pending";
  const size = props.size ?? "sm";
  const className = props.className ?? "";
  const geometry = GEOMETRY[size];
  return (
    <div className={`grid grid-cols-2 shrink-0 ${geometry[0]} ${className}`}>
      {CELLS.map((index) => {
        const cell = cellView(geometry, statusType, active, index);
        return (
          <motion.div
            key={index}
            animate={cell.animate}
            transition={cell.transition}
            className={cell.className}
          />
        );
      })}
    </div>
  );
}
