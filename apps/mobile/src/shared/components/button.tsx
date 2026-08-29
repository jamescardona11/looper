import * as Haptics from "expo-haptics";
import { Pressable, StyleSheet, Text } from "react-native";
import { colors } from "../theme/colors";
import { controlHeight, radius, relief, space } from "../theme/layout";
import { typography } from "../theme/typography";
import { Icon, type IconName } from "./icon";

type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";

type ButtonProps = {
  label: string;
  onPress: () => void;
  variant?: ButtonVariant;
  icon?: IconName;
  disabled?: boolean;
};

/**
 * El relieve sale de `relief`: cara arriba, canto abajo. Al pulsar, el canto se
 * come 2 px y la cara baja los mismos 2, así que la caja no se mueve y el
 * control solo se hunde.
 */
export function Button({ label, onPress, variant = "secondary", icon, disabled }: ButtonProps) {
  const labelColor = disabled ? colors.disabled : LABEL_COLOR[variant];

  return (
    <Pressable
      accessibilityLabel={label}
      accessibilityRole="button"
      accessibilityState={{ disabled: Boolean(disabled) }}
      disabled={disabled}
      onPress={onPress}
      onPressIn={() => tap(HAPTIC[variant])}
      style={({ pressed }) => [
        styles.base,
        disabled ? DISABLED[variant] : REST[variant],
        !disabled && pressed && PRESSED[variant],
      ]}
    >
      {icon ? <Icon color={labelColor} name={icon} size={18} /> : null}
      <Text
        style={[styles.label, variant === "primary" && styles.labelStrong, { color: labelColor }]}
      >
        {label}
      </Text>
    </Pressable>
  );
}

/** Un teléfono sin motor háptico no debe tumbar la pulsación. */
function tap(style: Haptics.ImpactFeedbackStyle) {
  try {
    void Haptics.impactAsync(style).catch(() => {});
  } catch {
    // sin háptica disponible
  }
}

const styles = StyleSheet.create({
  base: {
    alignItems: "center",
    borderRadius: radius.lg,
    flexDirection: "row",
    gap: space.sm,
    justifyContent: "center",
    minHeight: controlHeight,
    paddingHorizontal: space.xl,
  },
  danger: { backgroundColor: colors.danger },
  flatDisabled: {
    ...relief.disabled,
    backgroundColor: colors.surfaceMuted,
    borderColor: colors.border,
    borderWidth: 1,
  },
  ghost: { backgroundColor: "transparent" },
  ghostDisabled: { backgroundColor: "transparent" },
  ghostPressed: { backgroundColor: colors.accentSubtle },
  label: { ...typography.item },
  labelStrong: { fontWeight: "700" },
  primary: relief.primary,
  primaryPressed: relief.pressed,
  secondary: relief.secondary,
  sunk: relief.pressed,
});

const REST: Record<ButtonVariant, object> = {
  danger: styles.danger,
  ghost: styles.ghost,
  primary: styles.primary,
  secondary: styles.secondary,
};

const PRESSED: Record<ButtonVariant, object> = {
  danger: styles.sunk,
  ghost: styles.ghostPressed,
  primary: styles.primaryPressed,
  secondary: styles.sunk,
};

const DISABLED: Record<ButtonVariant, object> = {
  danger: styles.flatDisabled,
  ghost: styles.ghostDisabled,
  primary: styles.flatDisabled,
  secondary: styles.flatDisabled,
};

const LABEL_COLOR: Record<ButtonVariant, string> = {
  danger: colors.onDanger,
  ghost: colors.accent,
  primary: colors.onAccent,
  secondary: colors.text,
};

const HAPTIC: Record<ButtonVariant, Haptics.ImpactFeedbackStyle> = {
  danger: Haptics.ImpactFeedbackStyle.Medium,
  ghost: Haptics.ImpactFeedbackStyle.Light,
  primary: Haptics.ImpactFeedbackStyle.Medium,
  secondary: Haptics.ImpactFeedbackStyle.Light,
};

export type { ButtonVariant };
