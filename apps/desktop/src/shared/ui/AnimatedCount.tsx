import { AnimatePresence, motion, useReducedMotion } from "framer-motion";

type AnimatedCountProps = {
  value: number;
  className?: string;
  format?: (value: number) => string;
};

const defaultFormat = (value: number) => value.toLocaleString();

const rollTransition = { duration: 0.18, ease: [0.16, 1, 0.3, 1] as const };

/**
 * Número cuyos dígitos ruedan verticalmente al cambiar. Los lectores de
 * pantalla reciben el valor completo; los dígitos animados quedan ocultos
 * para accesibilidad.
 */
const AnimatedCount = ({
  value,
  className,
  format = defaultFormat,
}: AnimatedCountProps) => {
  const reduceMotion = useReducedMotion();
  const text = format(value);

  if (reduceMotion) {
    return <span className={className}>{text}</span>;
  }

  return (
    <span className={className}>
      <span className="sr-only">{text}</span>
      <span aria-hidden="true" className="looper-animated-count">
        {text.split("").map((char, index) => (
          // La posición es la identidad estable; el carácter anima al cambiar.
          <span key={index} className="inline-flex overflow-hidden">
            <AnimatePresence mode="popLayout" initial={false}>
              <motion.span
                key={char}
                initial={{ y: "0.7em", opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                exit={{ y: "-0.7em", opacity: 0 }}
                transition={rollTransition}
                className="inline-block"
              >
                {char === " " ? " " : char}
              </motion.span>
            </AnimatePresence>
          </span>
        ))}
      </span>
    </span>
  );
};

export default AnimatedCount;
