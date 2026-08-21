import { useDictationSettings, useNoteCommands, useRecordDictation } from "@looper/data";
import { type Href, useRouter } from "expo-router";
import { useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Clipboard,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import Svg, { Path } from "react-native-svg";
import { Button } from "@/shared/components/button";
import { Chip } from "@/shared/components/chip";
import { Icon } from "@/shared/components/icon";
import { formatPillDuration } from "@/shared/components/pill-listening-signal-logic";
import { EmptyState, ErrorState } from "@/shared/components/screen-states";
import { SectionLabel } from "@/shared/components/section-label";
import { normalizeStudioSettings } from "@/shared/studio/studio-settings";
import { colors } from "@/shared/theme/colors";
import { hitTarget, radius, relief, space } from "@/shared/theme/layout";
import { typography } from "@/shared/theme/typography";
import { LOCAL_STT_MODEL_DOWNLOAD_BYTES } from "./local-stt-model";
import { useAudioRecorder } from "./use-audio-recorder";
import { useLocalStt } from "./use-local-stt";

type Failure = { kind: "transcribe" | "save"; detail: string };

const NO_SPEECH = "No se detectó voz en la grabación.";
const DEFAULT_STYLE_NAME = "Claro y breve";

export function DictationScreen() {
  const router = useRouter();
  const recorder = useAudioRecorder();
  const localStt = useLocalStt();
  const notes = useNoteCommands();
  const history = useRecordDictation();
  const studio = useDictationSettings();
  const [transcript, setTranscript] = useState<string | null>(null);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [failure, setFailure] = useState<Failure | null>(null);
  const [copied, setCopied] = useState(false);
  const audioUri = useRef<string | null>(null);
  const starting = useRef<Promise<boolean> | null>(null);
  const holding = useRef(false);

  const styleName = useMemo(() => {
    const settings = normalizeStudioSettings(studio.doc?.data);
    const active = settings.styles.find((style) => style.id === settings.activeStyleId);
    return active?.name ?? DEFAULT_STYLE_NAME;
  }, [studio.doc?.data]);

  const modelReady = localStt.status === "ready";
  const phase: Phase = recorder.isRecording
    ? "recording"
    : isTranscribing
      ? "transcribing"
      : transcript
        ? "result"
        : "idle";

  const beginRecording = () => {
    setTranscript(null);
    setFailure(null);
    setCopied(false);
    starting.current = recorder.start();
    return starting.current;
  };

  // Soltar mientras `start()` sigue en vuelo dejaba la grabadora a medias, así
  // que parar espera siempre a que el arranque termine.
  const finishRecording = async () => {
    const started = await starting.current;
    if (started === false) return;
    const audio = await recorder.stop();
    if (!audio) return;
    audioUri.current = audio.uri;
    await transcribe(audio.uri);
  };

  const transcribe = async (uri: string) => {
    setIsTranscribing(true);
    setFailure(null);
    try {
      const text = await localStt.transcribe(uri);
      setTranscript(text || NO_SPEECH);
    } catch (cause) {
      setFailure({ kind: "transcribe", detail: messageFrom(cause) });
    } finally {
      setIsTranscribing(false);
    }
  };

  const save = async () => {
    if (!transcript || transcript === NO_SPEECH) return;
    try {
      const noteId = await notes.create({
        title: titleFromTranscript(transcript),
        body: transcript,
        kind: "dictation",
      });
      await history.record({ text: transcript, sourceId: `note:${noteId}` });
      setTranscript(null);
      setFailure(null);
    } catch (cause) {
      setFailure({ kind: "save", detail: messageFrom(cause) });
    }
  };

  const copy = () => {
    if (!transcript) return;
    // El portapapeles de react-native está marcado como obsoleto, pero el
    // workspace no trae `expo-clipboard` y aquí no se añaden dependencias.
    Clipboard.setString(transcript);
    setCopied(true);
  };

  const retry = () => {
    if (failure?.kind === "save") {
      void save();
      return;
    }
    if (audioUri.current) void transcribe(audioUri.current);
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.header}>
        <Pressable
          accessibilityLabel="Cerrar"
          accessibilityRole="button"
          onPress={() => (router.canGoBack() ? router.back() : router.replace("/" as Href))}
          style={styles.headerButton}
        >
          <Icon color={colors.textSecondary} name="close" size={20} strokeWidth={2.4} />
        </Pressable>
        <Text style={styles.headerTitle}>Dictar</Text>
        <Pressable
          accessibilityLabel="Abrir Studio"
          accessibilityRole="button"
          onPress={() => router.push("/studio" as Href)}
          style={styles.headerButton}
        >
          <Icon color={colors.textSecondary} name="studio" size={20} />
        </Pressable>
      </View>

      <View style={styles.chipRow}>
        <Chip label={`Estilo: ${styleName}`} onPress={() => router.push("/studio" as Href)} />
      </View>

      <View style={styles.body}>
        {failure ? (
          <ErrorState
            body={
              failure.kind === "save"
                ? "El texto sigue en pantalla; no se ha perdido nada."
                : "El audio se grabó, pero el modelo no pudo convertirlo a texto."
            }
            detail={failure.detail}
            onRetry={retry}
            title={failure.kind === "save" ? "No se pudo guardar" : "No se pudo transcribir"}
          />
        ) : null}

        {phase === "idle" && !failure ? (
          <IdleState
            downloading={localStt.status === "downloading" || localStt.status === "extracting"}
            modelError={localStt.error}
            onHoldEnd={() => {
              if (!holding.current) return;
              holding.current = false;
              void finishRecording();
            }}
            onHoldStart={() => {
              holding.current = true;
              void beginRecording();
            }}
            onInstall={() => void localStt.install()}
            onRetryModel={() => void localStt.refresh()}
            onTap={() => void beginRecording()}
            progress={localStt.progress}
            ready={modelReady}
            unsupported={localStt.memoryTier === "unsupported"}
          />
        ) : null}

        {phase === "recording" ? (
          <RecordingState durationMs={recorder.durationMs} level={recorder.audioLevel} />
        ) : null}

        {phase === "transcribing" ? (
          <View style={styles.centered}>
            <ActivityIndicator color={colors.accent} />
            <Text style={styles.supporting}>Convirtiendo el audio a texto…</Text>
          </View>
        ) : null}

        {phase === "result" && transcript ? (
          <ScrollView contentContainerStyle={styles.resultContent}>
            <View style={styles.resultCard}>
              <SectionLabel>Transcripción</SectionLabel>
              <Text style={styles.reading}>{transcript}</Text>
            </View>
            <Text style={styles.resultNote}>
              El estilo «{styleName}» da forma al texto al insertarlo desde el teclado de Looper.
            </Text>
          </ScrollView>
        ) : null}
      </View>

      <View style={styles.footer}>
        {recorder.error ? <Text style={styles.recorderError}>{recorder.error}</Text> : null}

        {phase === "idle" && modelReady && !failure ? (
          <>
            <Text style={styles.hint}>Mantén pulsado el botón para dictar sin soltarlo</Text>
            <Button
              label="Eliminar modelo"
              onPress={() => void localStt.remove()}
              variant="ghost"
            />
          </>
        ) : null}

        {phase === "recording" ? (
          <Button
            icon="stop"
            label="Terminar"
            onPress={() => void finishRecording()}
            variant="secondary"
          />
        ) : null}

        {phase === "result" && transcript ? (
          <View style={styles.resultActions}>
            <Pressable
              accessibilityLabel={copied ? "Texto copiado" : "Copiar texto"}
              accessibilityRole="button"
              onPress={copy}
              style={({ pressed }) => [styles.copyButton, pressed && styles.sunk]}
            >
              {copied ? (
                <Icon color={colors.accent} name="check" size={19} />
              ) : (
                <CopyGlyph color={colors.text} />
              )}
            </Pressable>
            <View style={styles.saveButton}>
              <Button label="Guardar en Library" onPress={() => void save()} variant="primary" />
            </View>
          </View>
        ) : null}
      </View>
    </SafeAreaView>
  );
}

type Phase = "idle" | "recording" | "transcribing" | "result";

type IdleStateProps = {
  ready: boolean;
  unsupported: boolean;
  downloading: boolean;
  progress: number;
  modelError: string | null;
  onInstall: () => void;
  onRetryModel: () => void;
  onTap: () => void;
  onHoldStart: () => void;
  onHoldEnd: () => void;
};

function IdleState({
  ready,
  unsupported,
  downloading,
  progress,
  modelError,
  onInstall,
  onRetryModel,
  onTap,
  onHoldStart,
  onHoldEnd,
}: IdleStateProps) {
  if (unsupported) {
    return (
      <EmptyState
        body="El modelo local necesita 4 GB de memoria y este teléfono no llega. El teclado de Looper sigue dictando."
        title="Aquí no cabe el dictado local"
      />
    );
  }

  if (modelError) {
    return (
      <ErrorState
        body="El modelo no se pudo preparar. La descarga se retoma donde se quedó."
        detail={modelError}
        onRetry={onRetryModel}
        title="Falta el modelo de dictado"
      />
    );
  }

  if (!ready) {
    return (
      <EmptyState
        action={
          <Button
            disabled={downloading}
            label={downloading ? `Descargando ${progress}%` : "Instalar dictado local"}
            onPress={onInstall}
            variant="primary"
          />
        }
        body={`Parakeet transcribe en el teléfono, sin mandar el audio a ningún sitio. Es una descarga única de ${formatBytes(LOCAL_STT_MODEL_DOWNLOAD_BYTES)}.`}
        title="Falta el modelo de dictado"
      />
    );
  }

  return (
    <View style={styles.idle}>
      <View style={styles.idleCopy}>
        <Text style={styles.idleTitle}>Habla y ya está</Text>
        <Text style={styles.supporting}>
          Parakeet transcribe en el teléfono. Studio le da la forma que elegiste.
        </Text>
      </View>
      <Pressable
        accessibilityLabel="Empezar a dictar"
        accessibilityRole="button"
        delayLongPress={220}
        onLongPress={onHoldStart}
        onPress={onTap}
        onPressOut={onHoldEnd}
        style={({ pressed }) => [styles.micButton, pressed && styles.micPressed]}
      >
        <Icon color={colors.text} name="mic" size={46} strokeWidth={1.9} />
      </Pressable>
    </View>
  );
}

function RecordingState({ durationMs, level }: { durationMs: number; level: number }) {
  return (
    <View style={styles.recording}>
      <View style={styles.signal}>
        <Text style={styles.timer}>{formatPillDuration(durationMs)}</Text>
        <LevelBars level={level} />
      </View>
      <View style={styles.rawBlock}>
        <SectionLabel>En crudo</SectionLabel>
        <Text style={styles.rawPending}>
          El texto aparece al terminar: Parakeet transcribe la grabación entera en el teléfono.
        </Text>
      </View>
    </View>
  );
}

function LevelBars({ level }: { level: number }) {
  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={styles.bars}
    >
      {BARS.map((bar) => {
        const reach = bar.weight * level;
        return (
          <View
            key={bar.id}
            style={[
              styles.bar,
              {
                backgroundColor: reach > 0.06 ? colors.accent : colors.surfaceElevated,
                height: Math.round(BAR_MIN + (BAR_MAX - BAR_MIN) * reach),
              },
            ]}
          />
        );
      })}
    </View>
  );
}

/** El trazo de copiar no está en ICON_PATHS todavía; sale del artboard. */
function CopyGlyph({ color }: { color: string }) {
  return (
    <Svg fill="none" height={19} viewBox="0 0 24 24" width={19}>
      {COPY_PATHS.map((d) => (
        <Path
          d={d}
          key={d}
          stroke={color}
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2}
        />
      ))}
    </Svg>
  );
}

function titleFromTranscript(transcript: string): string {
  const words = transcript.trim().split(/\s+/).slice(0, 8).join(" ");
  return words.length > 60 ? `${words.slice(0, 57)}…` : words;
}

function formatBytes(bytes: number): string {
  return `${Math.round(bytes / 1024 ** 2)} MB`;
}

function messageFrom(cause: unknown): string {
  return cause instanceof Error ? cause.message : "Error desconocido.";
}

const COPY_PATHS = [
  "M9 3h9a2 2 0 0 1 2 2v9",
  "M6 7h9a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V9a2 2 0 0 1 2-2Z",
];

/**
 * Perfil fijo de la señal: el centro responde más que los extremos, así el
 * bloque se lee como una voz y no como un ecualizador plano.
 */
const BAR_COUNT = 34;
const BAR_MIN = 3;
const BAR_MAX = 34;
const BARS = Array.from({ length: BAR_COUNT }, (_, index) => {
  const half = (BAR_COUNT - 1) / 2;
  const shape = 1 - (Math.abs(index - half) / half) ** 2;
  const grain = 0.55 + 0.45 * Math.abs(Math.sin(index * 2.4));
  return { id: `bar-${index}`, weight: 0.3 + 0.7 * shape * grain };
});

const MIC_SIZE = 128;
const COPY_SIZE = 54;

const styles = StyleSheet.create({
  bar: { borderRadius: radius.pill, width: 3 },
  bars: {
    alignItems: "center",
    backgroundColor: colors.backgroundSecondary,
    borderColor: colors.border,
    borderCurve: "continuous",
    borderRadius: radius.xl,
    borderWidth: 1,
    flexDirection: "row",
    gap: 3,
    height: 52,
    justifyContent: "center",
    width: "100%",
  },
  body: { flex: 1, gap: space.lg, paddingHorizontal: space.xl },
  centered: { alignItems: "center", flex: 1, gap: space.md, justifyContent: "center" },
  chipRow: { alignItems: "center", paddingBottom: 6 },
  copyButton: {
    ...relief.secondary,
    alignItems: "center",
    borderCurve: "continuous",
    borderRadius: radius.lg,
    height: COPY_SIZE,
    justifyContent: "center",
    width: COPY_SIZE,
  },
  footer: { gap: space.sm, paddingBottom: 30, paddingHorizontal: space.xl, paddingTop: space.md },
  header: {
    alignItems: "center",
    flexDirection: "row",
    height: 48,
    justifyContent: "space-between",
    paddingHorizontal: 6,
  },
  headerButton: {
    alignItems: "center",
    height: hitTarget,
    justifyContent: "center",
    width: hitTarget,
  },
  headerTitle: { ...typography.item, color: colors.textSecondary },
  hint: { ...typography.meta, color: colors.muted, lineHeight: 19, textAlign: "center" },
  idle: { alignItems: "center", flex: 1, gap: 30, justifyContent: "center", paddingBottom: 40 },
  idleCopy: { alignItems: "center", gap: 9 },
  idleTitle: { ...typography.display, color: colors.text },
  micButton: {
    ...relief.primary,
    alignItems: "center",
    borderRadius: radius.pill,
    height: MIC_SIZE,
    justifyContent: "center",
    width: MIC_SIZE,
  },
  micPressed: relief.pressed,
  rawBlock: { flex: 1, gap: 10 },
  rawPending: { ...typography.body, color: colors.muted },
  reading: { color: colors.text, fontSize: 17, lineHeight: 27 },
  recorderError: { ...typography.meta, color: colors.danger, textAlign: "center" },
  recording: { flex: 1, gap: space.xxl, paddingTop: space.lg },
  resultActions: { flexDirection: "row", gap: 10 },
  resultCard: {
    backgroundColor: colors.surfaceMuted,
    borderColor: colors.border,
    borderCurve: "continuous",
    borderRadius: radius.xl,
    borderWidth: 1,
    gap: 11,
    padding: 17,
  },
  resultContent: { gap: space.lg, paddingBottom: space.lg, paddingTop: 10 },
  resultNote: { ...typography.meta, color: colors.muted },
  safeArea: { backgroundColor: colors.background, flex: 1 },
  saveButton: { flex: 1 },
  signal: { alignItems: "center", gap: space.lg },
  sunk: relief.pressed,
  supporting: { ...typography.body, color: colors.muted, maxWidth: 260, textAlign: "center" },
  timer: {
    color: colors.accent,
    fontSize: 40,
    fontVariant: ["tabular-nums"],
    fontWeight: "700",
    letterSpacing: -1.2,
    lineHeight: 46,
  },
});
