import type { ErrorBoundaryProps } from "expo-router";
import { StyleSheet, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { NotesScreen } from "@/features/notes";
import { ErrorState } from "@/shared/components/screen-states";
import { colors } from "@/shared/theme/colors";
import { space } from "@/shared/theme/layout";

export default NotesScreen;

export function ErrorBoundary({ retry }: ErrorBoundaryProps) {
  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.content}>
        <ErrorState
          body="Tus notas siguen guardadas. Comprueba la conexión y vuelve a intentarlo."
          detail="notes: la consulta al backend no respondió"
          onRetry={() => void retry()}
          title="No se pudieron cargar las notas"
        />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { backgroundColor: colors.background, flex: 1 },
  content: { flex: 1, justifyContent: "center", paddingHorizontal: space.xl },
});
