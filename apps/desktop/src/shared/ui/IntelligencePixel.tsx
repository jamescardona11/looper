import { motion } from "framer-motion";

interface IntelligencePixelProps {
  active: boolean;
  statusType?: string;
  size?: "sm" | "md" | "lg";
  className?: string;
}

const SIZE_CLASSES = {
  sm: {
    container: "w-[10px] h-[10px] gap-[2px]",
    dot: "w-[4px] h-[4px] rounded-[1px]",
  },
  md: {
    container: "w-[20px] h-[20px] gap-[4px]",
    dot: "w-[8px] h-[8px] rounded-[2px]",
  },
  lg: {
    container: "w-[40px] h-[40px] gap-[8px]",
    dot: "w-[16px] h-[16px] rounded-[4px]",
  },
} as const;

function pixelColor(statusType: string, active: boolean) {
  if (statusType === "error") return "bg-[var(--color-error)]";
  if (active) {
    return "bg-[var(--color-accent)] shadow-[0_0_8px_var(--color-accent-30)]";
  }
  return "bg-[var(--color-text-muted)]";
}

export function IntelligencePixel({
  active,
  statusType = "pending",
  size = "sm",
  className = "",
}: IntelligencePixelProps) {
  const classes = SIZE_CLASSES[size];
  const restingOpacity = statusType === "complete" ? 0.8 : 0.3;

  return (
    <div
      className={`grid grid-cols-2 shrink-0 ${classes.container} ${className}`}
    >
      {Array.from({ length: 4 }, (_, index) => (
        <motion.div
          key={index}
          animate={
            active
              ? { opacity: [0.4, 1, 0.4], scale: [0.9, 1.1, 0.9] }
              : { opacity: restingOpacity, scale: 1 }
          }
          transition={
            active
              ? {
                  duration: 1.5,
                  repeat: Infinity,
                  delay: index * 0.2,
                  ease: "easeInOut",
                }
              : { duration: 0.3 }
          }
          className={`${classes.dot} ${pixelColor(statusType, active)}`}
        />
      ))}
    </div>
  );
}
