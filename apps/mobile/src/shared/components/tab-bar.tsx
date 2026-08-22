import * as Haptics from "expo-haptics";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { colors } from "../theme/colors";
import { radius, space } from "../theme/layout";
import { Icon, type IconName } from "./icon";

type Slot = { route: string; label: string; icon: IconName };

const SLOTS: Slot[] = [
  { route: "index", label: "Inicio", icon: "library" },
  { route: "notes", label: "Notas", icon: "nota" },
  { route: "ask", label: "Preguntar", icon: "ask" },
  { route: "studio", label: "Studio", icon: "studio" },
];

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

  return (
    <View style={[styles.root, { paddingBottom: insets.bottom + space.md }]}>
      <View style={styles.dock}>
        {SLOTS.slice(0, 2).map((slot) => (
          <TabItem
            active={activeRoute === slot.route}
            key={slot.route}
            onPress={() => onSelect(slot.route)}
            slot={slot}
          />
        ))}
        <CaptureButton onPress={onCapture} open={captureOpen} />
        {SLOTS.slice(2).map((slot) => (
          <TabItem
            active={activeRoute === slot.route}
            key={slot.route}
            onPress={() => onSelect(slot.route)}
            slot={slot}
          />
        ))}
      </View>
    </View>
  );
}

function TabItem({ slot, active, onPress }: { slot: Slot; active: boolean; onPress: () => void }) {
  const tint = active ? colors.accentLight : "rgba(255, 255, 255, 0.58)";
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
      <Icon color={tint} name={slot.icon} size={18} strokeWidth={active ? 2.4 : 2} />
      <Text style={[styles.label, { color: tint }, active && styles.labelActive]}>
        {slot.label}
      </Text>
    </Pressable>
  );
}

function CaptureButton({ onPress, open }: { onPress: () => void; open: boolean }) {
  return (
    <Pressable
      accessibilityLabel={open ? "Cerrar captura" : "Capturar"}
      accessibilityRole="button"
      onPress={() => {
        tap(Haptics.ImpactFeedbackStyle.Medium);
        onPress();
      }}
      style={({ pressed }) => [styles.capture, pressed && styles.capturePressed]}
    >
      <Icon color={colors.onAccent} name={open ? "close" : "plus"} size={22} strokeWidth={2.5} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  capture: {
    alignItems: "center",
    backgroundColor: colors.accent,
    borderRadius: 26,
    height: 52,
    justifyContent: "center",
    marginHorizontal: 3,
    width: 52,
  },
  capturePressed: { opacity: 0.72, transform: [{ scale: 0.94 }] },
  dock: {
    alignItems: "center",
    backgroundColor: colors.pillShell,
    borderColor: colors.pillBorder,
    borderCurve: "continuous",
    borderRadius: radius.xl + 4,
    borderWidth: 1,
    flexDirection: "row",
    padding: space.xs,
  },
  item: { alignItems: "center", gap: 3, height: 52, justifyContent: "center", width: 62 },
  label: { fontSize: 9, fontWeight: "500", lineHeight: 12 },
  labelActive: { fontWeight: "700" },
  root: { alignItems: "center", pointerEvents: "box-none" },
});
