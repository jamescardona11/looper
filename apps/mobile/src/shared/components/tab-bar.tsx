import { useTranslation } from "@looper/i18n/react";
import * as Haptics from "expo-haptics";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { colors } from "../theme/colors";
import { radius, space } from "../theme/layout";
import { Icon, type IconName } from "./icon";

type Slot = { route: string; label: string; icon: IconName };

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
  const { t } = useTranslation();
  const slots: Slot[] = [
    { route: "index", label: t("nav.home"), icon: "dictado" },
    { route: "notes", label: t("nav.library"), icon: "library" },
    { route: "ask", label: t("mobile.nav.ask"), icon: "ask" },
    { route: "studio", label: t("nav.studio"), icon: "studio" },
  ];

  return (
    <View style={[styles.root, { paddingBottom: insets.bottom + space.md }]}>
      <View style={styles.dock}>
        <View style={styles.pill}>
          {slots.map((slot) => (
            <TabItem
              active={activeRoute === slot.route}
              key={slot.route}
              onPress={() => onSelect(slot.route)}
              slot={slot}
            />
          ))}
        </View>
        <CaptureButton onPress={onCapture} open={captureOpen} />
      </View>
    </View>
  );
}

function TabItem({ slot, active, onPress }: { slot: Slot; active: boolean; onPress: () => void }) {
  const tint = active ? colors.accentLight : "rgba(255, 255, 255, 0.58)";
  return (
    <Pressable
      accessible
      accessibilityLabel={slot.label}
      accessibilityRole="tab"
      accessibilityState={{ selected: active }}
      onPress={() => {
        if (!active) tap(Haptics.ImpactFeedbackStyle.Light);
        onPress();
      }}
      testID={`tab-${slot.route}`}
      style={({ pressed }) => [styles.item, pressed && styles.itemPressed]}
    >
      <Icon color={tint} name={slot.icon} size={18} strokeWidth={active ? 2.4 : 2} />
      <Text style={[styles.label, { color: tint }, active && styles.labelActive]}>
        {slot.label}
      </Text>
    </Pressable>
  );
}

function CaptureButton({ onPress, open }: { onPress: () => void; open: boolean }) {
  const { t } = useTranslation();
  return (
    <Pressable
      accessibilityLabel={open ? t("mobile.capture.close") : t("mobile.capture.open")}
      accessibilityRole="button"
      onPress={() => {
        tap(Haptics.ImpactFeedbackStyle.Medium);
        onPress();
      }}
      testID="capture-button"
      style={({ pressed }) => [styles.capture, pressed && styles.capturePressed]}
    >
      <Icon color={colors.onAccent} name={open ? "close" : "dictado"} size={22} strokeWidth={2.1} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  capture: {
    alignItems: "center",
    backgroundColor: colors.accent,
    borderRadius: 20,
    height: 62,
    justifyContent: "center",
    marginHorizontal: 3,
    width: 62,
  },
  capturePressed: { opacity: 0.72, transform: [{ scale: 0.94 }] },
  dock: {
    alignItems: "center",
    flexDirection: "row",
    gap: 8,
    paddingHorizontal: space.md,
  },
  item: { alignItems: "center", flex: 1, gap: 3, height: 48, justifyContent: "center" },
  itemPressed: { opacity: 0.68, transform: [{ scale: 0.96 }] },
  label: { fontSize: 10, fontWeight: "500", lineHeight: 13 },
  labelActive: { fontWeight: "700" },
  pill: {
    alignItems: "center",
    backgroundColor: colors.pillShell,
    borderColor: colors.pillBorder,
    borderCurve: "continuous",
    borderRadius: radius.xl + 4,
    borderWidth: 1,
    flex: 1,
    flexDirection: "row",
    padding: space.xs,
  },
  root: { alignItems: "center", pointerEvents: "box-none" },
});
