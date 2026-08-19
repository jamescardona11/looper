import type { PropsWithChildren, ReactNode } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { LooperBrand } from "./looper-brand";
import { colors } from "../theme/colors";

export { colors } from "../theme/colors";

export function Screen({
  children,
  title,
  action,
}: PropsWithChildren<{ title: string; action?: ReactNode }>) {
  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.header}>
        <View style={styles.titleGroup}>
          <LooperBrand size={26} />
          <Text style={styles.title}>{title}</Text>
        </View>
        {action}
      </View>
      <ScrollView contentContainerStyle={styles.content}>{children}</ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: colors.background },
  header: {
    alignItems: "center",
    borderBottomColor: colors.border,
    borderBottomWidth: StyleSheet.hairlineWidth,
    flexDirection: "row",
    justifyContent: "space-between",
    minHeight: 56,
    paddingHorizontal: 20,
  },
  titleGroup: { alignItems: "center", flexDirection: "row", gap: 10 },
  title: { color: colors.text, fontSize: 22, fontWeight: "700" },
  content: { gap: 16, padding: 20 },
});
