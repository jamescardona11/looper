import { ConvexProvider, configFromEnv, useAuth } from "@looper/data";
import { detectLocale, type Locale, SUPPORTED_LOCALES } from "@looper/i18n";
import { I18nProvider, useTranslation } from "@looper/i18n/react";
import { Stack } from "expo-router";
import { type ReactNode, useEffect, useRef, useState } from "react";
import { ActivityIndicator, I18nManager, StyleSheet, Text, View } from "react-native";
import { SafeAreaProvider, SafeAreaView } from "react-native-safe-area-context";
import { LocalSttSmokeScreen } from "@/features/dictation/local-stt-smoke-screen";
import { KeyboardContentSync } from "@/features/keyboard/keyboard-content-sync";
import { LocalContentSync } from "@/features/library/local-content-sync";
import { ProductPreviewSeeder } from "@/features/product-preview/product-preview-seeder";
import { secureStorage } from "@/lib/secure-storage";
import { colors } from "@/shared/components/screen";

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
    <MobileI18nProvider>
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
    </MobileI18nProvider>
  );
}

function MobileI18nProvider({ children }: { children: ReactNode }) {
  const [locale, setLocale] = useState<Locale | null>(() =>
    isProductPreviewEnabled() ? detectMobileLocale() : null,
  );

  useEffect(() => {
    if (locale) return;
    void secureStorage
      .getItem("looper.locale")
      .then((stored) =>
        setLocale(
          SUPPORTED_LOCALES.includes(stored as Locale) ? (stored as Locale) : detectMobileLocale(),
        ),
      )
      .catch(() => setLocale(detectMobileLocale()));
  }, [locale]);

  return locale ? <I18nProvider defaultLocale={locale}>{children}</I18nProvider> : null;
}

function detectMobileLocale(): Locale {
  const nativeLocale = I18nManager.getConstants().localeIdentifier;
  const language = nativeLocale?.split(/[-_]/)[0];
  return SUPPORTED_LOCALES.includes(language as Locale) ? (language as Locale) : detectLocale();
}

function isLocalSttSmokeEnabled(): boolean {
  return __DEV__ && process.env.EXPO_PUBLIC_E2E_LOCAL_STT_SMOKE === "true";
}

function SessionGate({ children }: { children: ReactNode }) {
  const { t } = useTranslation();
  const { isAuthenticated, isLoading, signIn } = useAuth();
  const attempted = useRef(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isLoading || isAuthenticated || attempted.current) return;
    attempted.current = true;
    void signIn("anonymous").catch((cause: unknown) => {
      setError(cause instanceof Error ? cause.message : t("mobile.shell.signInFailed"));
    });
  }, [isAuthenticated, isLoading, signIn, t]);

  if (isAuthenticated) {
    return (
      <>
        {isProductPreviewEnabled() ? <ProductPreviewSeeder /> : null}
        <LocalContentSync>
          <KeyboardContentSync>{children}</KeyboardContentSync>
        </LocalContentSync>
      </>
    );
  }

  return (
    <SafeAreaView style={styles.gate}>
      <ActivityIndicator color={colors.accent} size="large" />
      <Text style={styles.gateTitle}>
        {error ? t("mobile.shell.openFailed") : t("mobile.shell.opening")}
      </Text>
      <Text style={styles.gateDetail}>{error ?? t("mobile.shell.preparing")}</Text>
    </SafeAreaView>
  );
}

function isProductPreviewEnabled(): boolean {
  return process.env.EXPO_PUBLIC_PRODUCT_PREVIEW === "true";
}

function BackendSetupScreen() {
  const { t } = useTranslation();

  return (
    <SafeAreaView style={styles.gate}>
      <View style={styles.setupCard}>
        <Text style={styles.gateTitle}>{t("mobile.shell.backendTitle")}</Text>
        <Text style={styles.gateDetail}>{t("mobile.shell.backendBody")}</Text>
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
