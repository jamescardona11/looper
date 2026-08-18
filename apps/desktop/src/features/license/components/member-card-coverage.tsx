import { motion } from "framer-motion";
import { TypewriterText } from "../../../shared/ui/TypewriterText";
import { useMemberCardPalette } from "./memberCardShared";

const revealEase = [0.22, 1, 0.36, 1] as const;
const coverageMetrics = {
  fontSize: "10px",
  fontWeight: 500,
  letterSpacing: "0.02em",
} as const;
const coverageClass = [
  "absolute",
  "inset-x-0",
  "top-0",
  "truncate",
  "font-mono",
].join(" ");
const coverageMotion = {
  initial: { opacity: 0, y: 5 },
  animate: { opacity: 1, y: 0 },
  transition: { duration: 0.55, ease: revealEase },
} as const;

export const MemberCardCoverage = ({
  text: coverage,
  animate: animated,
}: {
  text: string;
  animate: boolean;
}) => {
  const colors = useMemberCardPalette();
  const style = Object.assign({}, coverageMetrics, {
    color: colors.textDisabled,
  });
  return animated ? (
    <motion.div
      key="coverage-reveal"
      className={coverageClass}
      {...coverageMotion}
    >
      <TypewriterText text={coverage} as="p" style={style} speedMs={20} />
    </motion.div>
  ) : (
    <p className={coverageClass} style={style}>
      {coverage}
    </p>
  );
};
