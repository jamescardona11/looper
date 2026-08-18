import { useDictationHistory, useNotes } from "@looper/data";
import { useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";
import { PillListeningSignal } from "@/shared/components/pill-listening-signal";
import { colors, Screen } from "@/shared/components/screen";
import { LOCAL_STT_MODEL_DOWNLOAD_BYTES, LOCAL_STT_MODEL_NAME } from "./local-stt-model";
import { useAudioRecorder } from "./use-audio-recorder";
import { useLocalStt } from "./use-local-stt";

export function DictationScreen() {
  const recorder = useAudioRecorder();
  const localStt = useLocalStt();
  const notes = useNotes({ loadList: false });
  const history = useDictationHistory({ loadList: false });
  const [transcript, setTranscript] = useState<string | null>(null);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const toggleRecording = async () => {
    if (!recorder.isRecording) {
      setTranscript(null);
      setError(null);
      await recorder.start();
      return;
    }

    const audio = await recorder.stop();
    if (!audio) return;
    setIsTranscribing(true);
    setError(null);
    try {
      const text = await localStt.transcribe(audio.uri);
      setTranscript(text || "No se detectó voz en la grabación.");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "No se pudo transcribir el audio.");
    } finally {
      setIsTranscribing(false);
    }
  };

  const saveTranscript = async () => {
    if (!transcript || transcript === "No se detectó voz en la grabación.") return;
    try {
      const noteId = await notes.create({
        title: titleFromTranscript(transcript),
        body: transcript,
        kind: "dictation",
      });
      await history.record({ text: transcript, sourceId: `note:${noteId}` });
      setTranscript(null);
    } catch {
      setError("No se pudo guardar la transcripción en este dispositivo. Inténtalo de nuevo.");
    }
  };

  const needsModel = localStt.status !== "ready";
  const modelUnavailable = localStt.memoryTier === "unsupported";

  return (
    <Screen title="Dictar">
      <Text style={styles.intro}>
        El audio se convierte a texto en este dispositivo. Al guardar, el texto pasa a tus notas.
      </Text>
      <View style={styles.card}>
        <Text style={styles.cardTitle}>{LOCAL_STT_MODEL_NAME}</Text>
        <Text style={styles.cardBody}>
          Descarga única de {formatBytes(LOCAL_STT_MODEL_DOWNLOAD_BYTES)}. Requiere un development
          build.
        </Text>
        {modelUnavailable ? (
          <Text style={styles.error}>
            Este dispositivo no tiene memoria suficiente para el modelo local.
          </Text>
        ) : needsModel ? (
          <Pressable
            disabled={
              localStt.status === "checking" ||
              localStt.status === "downloading" ||
              localStt.status === "extracting"
            }
            onPress={() => void localStt.install()}
            style={styles.primaryButton}
          >
            <Text style={styles.primaryButtonText}>
              {localStt.status === "downloading" || localStt.status === "extracting"
                ? `${localStt.status === "extracting" ? "Preparando" : "Descargando"} ${localStt.progress}%`
                : "Instalar dictado local"}
            </Text>
          </Pressable>
        ) : (
          <Pressable onPress={() => void localStt.remove()} style={styles.secondaryButton}>
            <Text style={styles.secondaryButtonText}>Eliminar modelo</Text>
          </Pressable>
        )}
        {localStt.error ? <Text style={styles.error}>{localStt.error}</Text> : null}
      </View>
      <Pressable
        disabled={needsModel || modelUnavailable || isTranscribing}
        onPress={() => void toggleRecording()}
        style={[
          styles.recordButton,
          recorder.isRecording && styles.listeningButton,
          (needsModel || modelUnavailable) && styles.disabledButton,
        ]}
      >
        {isTranscribing ? <ActivityIndicator color={colors.onAccent} /> : null}
        {recorder.isRecording ? (
          <PillListeningSignal active elapsedMs={recorder.durationMs} level={recorder.audioLevel} />
        ) : null}
        <Text
          style={[
            styles.recordButtonText,
            recorder.isRecording && styles.listeningButtonText,
            (needsModel || modelUnavailable) && styles.disabledButtonText,
          ]}
        >
          {isTranscribing
            ? "Transcribiendo"
            : recorder.isRecording
              ? "Detener y transcribir"
              : "Empezar a dictar"}
        </Text>
      </Pressable>
      {recorder.error || error ? <Text style={styles.error}>{recorder.error ?? error}</Text> : null}
      {transcript ? (
        <View style={styles.transcriptCard}>
          <Text style={styles.transcriptLabel}>Transcripción</Text>
          <Text style={styles.transcript}>{transcript}</Text>
          <Pressable onPress={() => void saveTranscript()} style={styles.primaryButton}>
            <Text style={styles.primaryButtonText}>Guardar como nota</Text>
          </Pressable>
        </View>
      ) : null}
    </Screen>
  );
}

function titleFromTranscript(transcript: string): string {
  const words = transcript.trim().split(/\s+/).slice(0, 8).join(" ");
  return words.length > 60 ? `${words.slice(0, 57)}…` : words;
}

function formatBytes(bytes: number): string {
  return `${Math.round(bytes / 1024 ** 2)} MB`;
}

const styles = StyleSheet.create({
  intro: { color: colors.textSecondary, fontSize: 16, lineHeight: 23 },
  card: { backgroundColor: colors.surface, borderRadius: 16, gap: 10, padding: 18 },
  cardTitle: { color: colors.text, fontSize: 18, fontWeight: "700" },
  cardBody: { color: colors.textSecondary, lineHeight: 20 },
  primaryButton: {
    alignSelf: "flex-start",
    backgroundColor: colors.accent,
    borderRadius: 10,
    paddingHorizontal: 16,
    paddingVertical: 11,
  },
  primaryButtonText: { color: colors.onAccent, fontWeight: "700" },
  secondaryButton: {
    alignSelf: "flex-start",
    borderColor: colors.borderStrong,
    borderRadius: 10,
    borderWidth: 1,
    paddingHorizontal: 16,
    paddingVertical: 11,
  },
  secondaryButtonText: { color: colors.text, fontWeight: "700" },
  recordButton: {
    alignItems: "center",
    backgroundColor: colors.accent,
    borderRadius: 18,
    gap: 6,
    minHeight: 132,
    justifyContent: "center",
    padding: 20,
  },
  listeningButton: {
    backgroundColor: colors.backgroundSecondary,
    borderColor: colors.border,
    borderWidth: 1,
  },
  listeningButtonText: { color: colors.textSecondary, fontSize: 14, fontWeight: "700" },
  disabledButton: { backgroundColor: colors.surfaceElevated },
  disabledButtonText: { color: colors.textSecondary },
  recordButtonText: { color: colors.onAccent, fontSize: 18, fontWeight: "800" },
  error: { color: colors.danger, lineHeight: 20 },
  transcriptCard: { backgroundColor: colors.surface, borderRadius: 16, gap: 12, padding: 18 },
  transcriptLabel: {
    color: colors.accent,
    fontSize: 13,
    fontWeight: "800",
    textTransform: "uppercase",
  },
  transcript: { color: colors.text, fontSize: 17, lineHeight: 25 },
});
