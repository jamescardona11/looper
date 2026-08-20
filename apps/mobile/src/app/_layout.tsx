import { ConvexProvider, configFromEnv, useAuth } from "@looper/data";
import { Stack } from "expo-router";
import { type ReactNode, useEffect, useRef, useState } from "react";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";
import { SafeAreaProvider, SafeAreaView } from "react-native-safe-area-context";
import { secureStorage } from "@/lib/secure-storage";
import { colors } from "@/shared/components/screen";
import { LocalSttSmokeScreen } from "@/features/dictation/local-stt-smoke-screen";
import { LocalContentSync } from "@/features/library/local-content-sync";
import { KeyboardContentSync } from "@/features/keyboard/keyboard-content-sync";

const convexUrl = process.env.EXPO_PUBLIC_CONVEX_URL;

const config = configFromEnv(
  { EXPO_PUBLIC_CONVEX_URL: convexUrl },
  {
    storage: secureStorage,
    setupBanner: <BackendSetupScreen />,
  },
);

export default function RootLayout() {
  if (isLocalSttSmokeEnabled()) {
    return (
      <SafeAreaProvider>
        <LocalSttSmokeScreen />
      </SafeAreaProvider>
    );
  }

  return (
    <SafeAreaProvider>
      <ConvexProvider config={config}>
        <SessionGate>
          <Stack
            screenOptions={{
              contentStyle: { backgroundColor: colors.background },
              headerShown: false,
            }}
          />
        </SessionGate>
      </ConvexProvider>
    </SafeAreaProvider>
  );
}

function isLocalSttSmokeEnabled(): boolean {
  return __DEV__ && process.env.EXPO_PUBLIC_E2E_LOCAL_STT_SMOKE === "true";
}

function SessionGate({ children }: { children: ReactNode }) {
  const { isAuthenticated, isLoading, signIn } = useAuth();
  const attempted = useRef(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isLoading || isAuthenticated || attempted.current) return;
    attempted.current = true;
    void signIn("anonymous").catch((cause: unknown) => {
      setError(cause instanceof Error ? cause.message : "No se pudo iniciar la sesión.");
    });
  }, [isAuthenticated, isLoading, signIn]);

  if (isAuthenticated) {
    return (
      <LocalContentSync>
        <KeyboardContentSync>{children}</KeyboardContentSync>
      </LocalContentSync>
    );
  }

  return (
    <SafeAreaView style={styles.gate}>
      <ActivityIndicator color={colors.accent} size="large" />
      <Text style={styles.gateTitle}>{error ? "No se pudo abrir Looper" : "Abriendo Looper"}</Text>
      <Text style={styles.gateDetail}>
        {error ?? "Preparando una sesión privada para tus notas y tu teclado."}
      </Text>
    </SafeAreaView>
  );
}

function BackendSetupScreen() {
  return (
    <SafeAreaView style={styles.gate}>
      <View style={styles.setupCard}>
        <Text style={styles.gateTitle}>Falta conectar Looper</Text>
        <Text style={styles.gateDetail}>
          Define EXPO_PUBLIC_CONVEX_URL y reinicia el development build.
        </Text>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  gate: {
    alignItems: "center",
    backgroundColor: colors.background,
    flex: 1,
    gap: 12,
    justifyContent: "center",
    padding: 28,
  },
  gateTitle: { color: colors.text, fontSize: 22, fontWeight: "700", textAlign: "center" },
  gateDetail: { color: colors.textSecondary, fontSize: 16, lineHeight: 24, textAlign: "center" },
  setupCard: { gap: 12, maxWidth: 360 },
});
