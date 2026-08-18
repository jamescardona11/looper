import type { ErrorBoundaryProps } from "expo-router";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { NotesScreen } from "@/features/notes";
import { colors, Screen } from "@/shared/components/screen";

export default NotesScreen;

export function ErrorBoundary({ retry }: ErrorBoundaryProps) {
  return (
    <Screen title="Notas">
      <View style={styles.card}>
        <Text style={styles.title}>No se pudieron cargar las notas</Text>
        <Text style={styles.detail}>
          Comprueba la conexión o despliega las funciones de notas en el backend y vuelve a intentarlo.
        </Text>
        <Pressable onPress={() => void retry()} style={styles.retryButton}>
          <Text style={styles.retryText}>Reintentar</Text>
        </Pressable>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  card: { backgroundColor: colors.surface, borderRadius: 16, gap: 12, padding: 18 },
  title: { color: colors.text, fontSize: 18, fontWeight: "700" },
  detail: { color: colors.textSecondary, lineHeight: 21 },
  retryButton: {
    alignSelf: "flex-start",
    backgroundColor: colors.accent,
    borderRadius: 10,
    paddingHorizontal: 16,
    paddingVertical: 11,
  },
  retryText: { color: colors.onAccent, fontWeight: "700" },
});
