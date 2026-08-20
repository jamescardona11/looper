import { Pressable, StyleSheet, Text, View } from "react-native";
import { colors } from "../theme/colors";
import { radius, space } from "../theme/layout";
import { typography } from "../theme/typography";
import { Icon, type IconName } from "./icon";

type ChipProps = {
  label: string;
  selected?: boolean;
  icon?: IconName;
  onPress?: () => void;
};

/**
 * Sin `onPress` es una etiqueta, no un control: se pinta como `View` para que
 * el lector de pantalla no la anuncie como botón.
 */
export function Chip({ label, selected, icon, onPress }: ChipProps) {
  const tint = selected ? colors.accent : colors.muted;
  const body = (
    <>
      {icon ? <Icon color={tint} name={icon} size={14} /> : null}
      <Text style={[styles.label, { color: tint }]}>{label}</Text>
    </>
  );
  const shape = [styles.base, selected ? styles.selected : styles.neutral];

  if (!onPress) {
    return <View style={shape}>{body}</View>;
  }

  return (
    <Pressable
      accessibilityLabel={label}
      accessibilityRole="button"
      accessibilityState={{ selected: Boolean(selected) }}
      onPress={onPress}
      style={({ pressed }) => [...shape, pressed && styles.pressed]}
    >
      {body}
    </Pressable>
  );
}

const CHIP_HEIGHT = 34;

const styles = StyleSheet.create({
  base: {
    alignItems: "center",
    borderRadius: radius.pill,
    borderWidth: 1,
    flexDirection: "row",
    gap: space.sm,
    height: CHIP_HEIGHT,
    justifyContent: "center",
    paddingHorizontal: space.md,
  },
  label: { ...typography.meta, fontWeight: "600" },
  neutral: { backgroundColor: "transparent", borderColor: colors.border },
  pressed: { opacity: 0.6 },
  selected: { backgroundColor: colors.accentSubtle, borderColor: colors.accent },
});
