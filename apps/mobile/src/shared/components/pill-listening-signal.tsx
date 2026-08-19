import { useEffect } from "react";
import { StyleSheet, Text, View } from "react-native";
import Animated, {
  ReduceMotion,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";
import { colors } from "@/shared/theme/colors";
import { createPillDotGrid, formatPillDuration, type PillDot } from "./pill-listening-signal-logic";

interface PillListeningSignalProps {
  active: boolean;
  elapsedMs: number;
  level: number;
}

const dots = createPillDotGrid();

export function PillListeningSignal({ active, elapsedMs, level }: PillListeningSignalProps) {
  return (
    <View
      accessible
      accessibilityLabel={`Escuchando, ${formatPillDuration(elapsedMs)}`}
      style={styles.shell}
    >
      <View
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
        style={styles.grid}
      >
        {dots.map((dot) => (
          <SignalDot active={active} dot={dot} key={`${dot.column}-${dot.row}`} level={level} />
        ))}
      </View>
      <View style={styles.divider} />
      <View style={styles.copy}>
        <Text style={styles.title}>Listening</Text>
        <Text style={styles.timer}>{formatPillDuration(elapsedMs)}</Text>
      </View>
    </View>
  );
}

function SignalDot({ active, dot, level }: { active: boolean; dot: PillDot; level: number }) {
  const intensity = active ? dot.intensity(level) : 0;
  const progress = useSharedValue(intensity);

  useEffect(() => {
    progress.set(
      withTiming(intensity, {
        duration: intensity > progress.get() ? 80 : 240,
        reduceMotion: ReduceMotion.System,
      }),
    );
  }, [intensity, progress]);

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: progress.get() * dot.maskOpacity,
    transform: [{ scale: 0.72 + progress.get() * 0.38 }],
  }));

  return (
    <View style={[styles.dotCell, { left: dot.x, top: dot.y }]}>
      <View style={[styles.baseDot, { opacity: dot.maskOpacity }]} />
      <Animated.View style={[styles.highlightDot, animatedStyle]} />
    </View>
  );
}

const styles = StyleSheet.create({
  shell: {
    alignItems: "center",
    alignSelf: "center",
    backgroundColor: colors.pillShell,
    borderColor: colors.pillBorder,
    borderCurve: "continuous",
    borderRadius: 24,
    borderWidth: 1,
    flexDirection: "row",
    height: 48,
    paddingHorizontal: 14,
    shadowColor: colors.shadow,
    shadowOffset: { height: 8, width: 0 },
    shadowOpacity: 0.22,
    shadowRadius: 11,
    width: 176,
  },
  grid: { height: 18, position: "relative", width: 32 },
  dotCell: { height: 2, position: "absolute", width: 2 },
  baseDot: {
    backgroundColor: colors.pillDotBase,
    borderRadius: 1,
    height: 1.8,
    left: 0.1,
    position: "absolute",
    top: 0.1,
    width: 1.8,
  },
  highlightDot: {
    backgroundColor: colors.pillDotHighlight,
    borderRadius: 1,
    height: 2,
    position: "absolute",
    width: 2,
  },
  divider: { backgroundColor: colors.pillBorder, height: 22, marginHorizontal: 11, width: 1 },
  copy: { flex: 1, gap: 1 },
  title: { color: colors.text, fontSize: 11, fontWeight: "700", lineHeight: 13 },
  timer: {
    color: colors.textSecondary,
    fontSize: 10,
    fontVariant: ["tabular-nums"],
    fontWeight: "600",
    lineHeight: 12,
  },
});
