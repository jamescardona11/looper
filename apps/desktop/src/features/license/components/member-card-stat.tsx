import { motion } from "framer-motion";
import { useMemberCardPalette } from "./memberCardShared";

const revealEase = [0.22, 1, 0.36, 1] as const;
const statClasses = {
  frame: ["min-w-0"].join(""),
  term: ["font-mono", "uppercase", "tracking-[0.16em]"].join(" "),
  value: ["mt-1", "break-words", "font-mono"].join(" "),
};

const statMotion = (visible: boolean, delay: number) => ({
  initial: false as const,
  animate: { opacity: Number(visible), y: visible ? 0 : 4 },
  transition: {
    duration: 0.5,
    ease: revealEase,
    delay: visible ? delay : 0,
  },
});

export const MemberCardStat = ({
  label: term,
  value: reading,
  show: visible,
  delaySec: delay = 0,
}: {
  label: string;
  value: string;
  show: boolean;
  delaySec?: number;
}) => {
  const colors = useMemberCardPalette();
  return (
    <motion.div className={statClasses.frame} {...statMotion(visible, delay)}>
      <dt
        className={statClasses.term}
        style={Object.assign(
          { fontSize: "9.5px", fontWeight: 600 },
          { color: colors.textDisabled },
        )}
      >
        {term}
      </dt>
      <dd
        className={statClasses.value}
        style={Object.assign(
          { fontSize: "13px", fontWeight: 500 },
          { color: colors.textPrimary },
        )}
      >
        {reading}
      </dd>
    </motion.div>
  );
};
