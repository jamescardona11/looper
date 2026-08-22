import * as Device from "expo-device";
import { File, Paths } from "expo-file-system";
import { useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";
import { colors, Screen } from "@/shared/components/screen";
import { getLocalSttMemoryTier } from "./local-stt-model";
import {
  installLocalSttModel,
  isLocalSttModelInstalled,
  transcribeWithLocalStt,
} from "./local-stt-runtime";
import { evaluateLocalSttSmokeTranscript } from "./local-stt-smoke";

type SmokeStatus = "idle" | "installing" | "downloading-fixture" | "transcribing" | "pass" | "fail";

interface SmokeMetrics {
  modelWasInstalled: boolean;
  modelInstallMs: number;
  transcriptionMs: number;
  totalMs: number;
}

export function LocalSttSmokeScreen() {
  const [status, setStatus] = useState<SmokeStatus>("idle");
  const [progress, setProgress] = useState(0);
  const [transcript, setTranscript] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [metrics, setMetrics] = useState<SmokeMetrics | null>(null);
  const running = ["installing", "downloading-fixture", "transcribing"].includes(status);

  const runSmokeTest = async () => {
    if (running) return;

    const fixtureUri = process.env.EXPO_PUBLIC_E2E_AUDIO_FIXTURE_URI;
    const fixtureFile = new File(Paths.cache, "looper-local-stt-smoke-harvard.wav");
    const startedAt = Date.now();
    setError(null);
    setMetrics(null);
    setProgress(0);
    setTranscript("");

    try {
      if (!fixtureUri) throw new Error("Falta EXPO_PUBLIC_E2E_AUDIO_FIXTURE_URI para esta prueba.");
      const allowsLowMemoryTest =
        process.env.EXPO_PUBLIC_E2E_LOCAL_STT_SMOKE_ALLOW_LOW_MEMORY === "true";
      if (getLocalSttMemoryTier(Device.totalMemory) === "unsupported" && !allowsLowMemoryTest) {
        throw new Error("El dictado local requiere al menos 4 GB de memoria.");
      }

      setStatus("installing");
      const modelWasInstalled = await isLocalSttModelInstalled();
      const modelStartedAt = Date.now();
      if (!modelWasInstalled) await installLocalSttModel((next) => setProgress(next.percent));
      const modelInstallMs = Date.now() - modelStartedAt;

      setStatus("downloading-fixture");
      if (fixtureFile.exists) fixtureFile.delete();
      await File.downloadFileAsync(fixtureUri, fixtureFile);

      setStatus("transcribing");
      const transcriptionStartedAt = Date.now();
      const nextTranscript = await transcribeWithLocalStt(fixtureFile.uri);
      const transcriptionMs = Date.now() - transcriptionStartedAt;
      const evaluation = evaluateLocalSttSmokeTranscript(nextTranscript);
      if (!evaluation.ok) {
        throw new Error(
          `Faltan anclas de la transcripción: ${evaluation.missingPhrases.join(", ")}`,
        );
      }

      setTranscript(nextTranscript);
      setMetrics({
        modelWasInstalled,
        modelInstallMs,
        transcriptionMs,
        totalMs: Date.now() - startedAt,
      });
      setStatus("pass");
      console.log("[local-stt-smoke] PASS", { transcript: nextTranscript });
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : String(cause);
      setError(message);
      setStatus("fail");
      console.error("[local-stt-smoke] FAIL", message);
    } finally {
      try {
        if (fixtureFile.exists) fixtureFile.delete();
      } catch {
        // El sistema puede desalojar la caché antes de esta limpieza.
      }
    }
  };

  return (
    <Screen title="Prueba de Parakeet">
      <Text style={styles.intro}>
        Sólo desarrollo: instala el modelo fijado, transcribe harvard.wav real y valida sus tres
        frases. No usa el micrófono, Convex ni un proveedor en la nube.
      </Text>
      <View style={styles.card}>
        <Text style={styles.status}>Estado: {status}</Text>
        {running ? <ActivityIndicator color={colors.accent} /> : null}
        {status === "installing" ? (
          <Text style={styles.detail}>Preparando modelo: {progress}%</Text>
        ) : null}
        {status === "pass" ? (
          <Text testID="local-stt-smoke-pass" style={styles.pass}>
            PASS
          </Text>
        ) : null}
        {status === "fail" ? (
          <Text testID="local-stt-smoke-fail" accessibilityRole="alert" style={styles.error}>
            FAIL: {error}
          </Text>
        ) : null}
      </View>
      <Pressable
        testID="local-stt-smoke-run"
        accessibilityLabel="Ejecutar prueba local de STT"
        accessibilityRole="button"
        disabled={running}
        onPress={() => void runSmokeTest()}
        style={[styles.runButton, running && styles.runButtonDisabled]}
      >
        <Text style={styles.runButtonText}>Ejecutar prueba local</Text>
      </Pressable>
      {metrics ? (
        <Text testID="local-stt-smoke-metrics" style={styles.detail}>
          Modelo {metrics.modelWasInstalled ? "caliente" : "frío"}: {metrics.modelInstallMs} ms ·
          Inferencia: {metrics.transcriptionMs} ms · Total: {metrics.totalMs} ms
        </Text>
      ) : null}
      {transcript ? (
        <Text testID="local-stt-smoke-transcript" style={styles.transcript}>
          {transcript}
        </Text>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  intro: { color: colors.textSecondary, fontSize: 16, lineHeight: 23 },
  card: { backgroundColor: colors.surface, borderRadius: 16, gap: 10, padding: 18 },
  status: { color: colors.text, fontSize: 16, fontWeight: "700" },
  detail: { color: colors.textSecondary, lineHeight: 20 },
  pass: { color: colors.accent, fontWeight: "800" },
  error: { color: colors.danger, lineHeight: 20 },
  runButton: {
    alignItems: "center",
    backgroundColor: colors.accent,
    borderRadius: 12,
    minHeight: 50,
    justifyContent: "center",
    paddingHorizontal: 16,
  },
  runButtonDisabled: { opacity: 0.6 },
  runButtonText: { color: colors.onAccent, fontWeight: "800" },
  transcript: { color: colors.text, fontSize: 16, lineHeight: 22 },
});
