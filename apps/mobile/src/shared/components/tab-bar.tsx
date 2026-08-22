import * as Haptics from "expo-haptics";
import { useEffect } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { colors } from "../theme/colors";
import { radius, space } from "../theme/layout";
import { Icon, type IconName } from "./icon";

type Slot = { route: string; label: string; icon: IconName };

const SLOTS: Slot[] = [
  { route: "index", label: "Library", icon: "library" },
  { route: "ask", label: "Ask", icon: "ask" },
];

/**
 * Una píldora que se encoge a su contenido, no una barra que estira slots
 * vacíos a lo ancho: con solo dos destinos, repartir 393 px entre tres huecos
 * es lo que hacía que se viera despoblada.
 *
 * El botón de captura va al ras dentro de la píldora en vez de elevado. Un
 * bloque sobresaliendo con labio duro pesaba demasiado al lado de dos iconos
 * de trazo fino.
 */
const ITEM_WIDTH = 78;
const ITEM_HEIGHT = 52;
const CAPTURE_SIZE = 48;
/** Muelle corto: la cápsula debe llegar antes de que sueltes el dedo. */
const SPRING = { damping: 18, stiffness: 260, mass: 0.6 } as const;

function tap(style: Haptics.ImpactFeedbackStyle) {
  void Haptics.impactAsync(style).catch(() => {});
}

export function TabBar({
  activeRoute,
  onSelect,
  onCapture,
  captureOpen = false,
}: {
  activeRoute: string;
  onSelect: (route: string) => void;
  onCapture: () => void;
  captureOpen?: boolean;
}) {
  const insets = useSafeAreaInsets();
  const activeIndex = Math.max(
    0,
    SLOTS.findIndex((slot) => slot.route === activeRoute),
  );

  return (
    <View style={[styles.root, { paddingBottom: insets.bottom + space.md }]}>
      <View style={styles.pill}>
        <Capsule index={activeIndex} />
        <TabItem
          active={activeIndex === 0}
          onPress={() => onSelect(SLOTS[0].route)}
          slot={SLOTS[0]}
        />
        <CaptureButton onPress={onCapture} open={captureOpen} />
        <TabItem
          active={activeIndex === 1}
          onPress={() => onSelect(SLOTS[1].route)}
          slot={SLOTS[1]}
        />
      </View>
    </View>
  );
}

/** El indicador de posición: se desliza entre pestañas en vez de aparecer. */
function Capsule({ index }: { index: number }) {
  const offset = useSharedValue(0);
  const travel = ITEM_WIDTH + CAPTURE_SIZE + space.sm * 2;

  useEffect(() => {
    offset.value = withSpring(index * travel, SPRING);
  }, [index, offset, travel]);

  const style = useAnimatedStyle(() => ({
    transform: [{ translateX: offset.value }],
  }));

  return <Animated.View style={[styles.capsule, style]} />;
}

function TabItem({ slot, active, onPress }: { slot: Slot; active: boolean; onPress: () => void }) {
  const scale = useSharedValue(1);

  useEffect(() => {
    if (!active) return;
    // Un rebote corto al llegar, no un pulso permanente.
    scale.value = withSpring(1.14, { damping: 9, stiffness: 320 }, () => {
      scale.value = withSpring(1, SPRING);
    });
  }, [active, scale]);

  const iconStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));
  const tint = active ? colors.accent : colors.muted;

  return (
    <Pressable
      accessibilityLabel={slot.label}
      accessibilityRole="tab"
      accessibilityState={{ selected: active }}
      onPress={() => {
        if (!active) tap(Haptics.ImpactFeedbackStyle.Light);
        onPress();
      }}
      style={styles.item}
    >
      <Animated.View style={iconStyle}>
        <Icon color={tint} name={slot.icon} size={22} />
      </Animated.View>
      <Text style={[styles.label, { color: tint }]}>{slot.label}</Text>
    </Pressable>
  );
}

/** El "+" gira a "×" cuando la hoja está abierta: un control, dos estados. */
function CaptureButton({ onPress, open }: { onPress: () => void; open: boolean }) {
  const press = useSharedValue(1);
  const turn = useSharedValue(0);

  useEffect(() => {
    turn.value = withSpring(open ? 1 : 0, SPRING);
  }, [open, turn]);

  const style = useAnimatedStyle(() => ({
    transform: [{ scale: press.value }, { rotate: `${turn.value * 45}deg` }],
  }));

  return (
    <Pressable
      accessibilityLabel="Capturar"
      accessibilityRole="button"
      onPress={() => {
        tap(Haptics.ImpactFeedbackStyle.Medium);
        onPress();
      }}
      onPressIn={() => {
        press.value = withTiming(0.9, { duration: 90 });
      }}
      onPressOut={() => {
        press.value = withSpring(1, SPRING);
      }}
    >
      <Animated.View style={[styles.capture, style]}>
        <Icon color={colors.text} name="plus" size={24} strokeWidth={2.4} />
      </Animated.View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  capsule: {
    backgroundColor: colors.surface,
    borderRadius: radius.xl,
    height: ITEM_HEIGHT,
    left: space.xs,
    position: "absolute",
    top: space.xs,
    width: ITEM_WIDTH,
  },
  capture: {
    alignItems: "center",
    backgroundColor: colors.accent,
    borderRadius: CAPTURE_SIZE / 2,
    height: CAPTURE_SIZE,
    justifyContent: "center",
    marginHorizontal: space.sm,
    width: CAPTURE_SIZE,
  },
  item: {
    alignItems: "center",
    gap: 3,
    height: ITEM_HEIGHT,
    justifyContent: "center",
    width: ITEM_WIDTH,
  },
  label: { fontSize: 11, fontWeight: "500", lineHeight: 14 },
  pill: {
    alignItems: "center",
    backgroundColor: colors.surfaceMuted,
    borderColor: colors.border,
    borderCurve: "continuous",
    borderRadius: radius.xl + space.xs,
    borderWidth: 1,
    flexDirection: "row",
    padding: space.xs,
  },
  root: { alignItems: "center", pointerEvents: "box-none" },
});
