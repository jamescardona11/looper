import { StyleSheet, Text } from "react-native";
import { colors } from "../theme/colors";
import { typography } from "../theme/typography";

/** Rótulo de sección: 11 con tracking abierto, siempre en caja alta. */
export function SectionLabel({ children }: { children: string }) {
  return <Text style={styles.label}>{children}</Text>;
}

const styles = StyleSheet.create({
  label: { ...typography.label, color: colors.muted, textTransform: "uppercase" },
});
