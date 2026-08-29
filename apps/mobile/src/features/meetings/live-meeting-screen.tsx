import { type Href, useRouter } from "expo-router";
import * as Haptics from "expo-haptics";
import { useEffect, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import Animated, {
  cancelAnimation,
  Easing,
  ReduceMotion,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from "react-native-reanimated";
import { SafeAreaView } from "react-native-safe-area-context";
import Svg, { Circle } from "react-native-svg";
import { Button } from "@/shared/components/button";
import { Icon } from "@/shared/components/icon";
import { ErrorState } from "@/shared/components/screen-states";
import { SectionLabel } from "@/shared/components/section-label";
import { colors } from "@/shared/theme/colors";
import { hitTarget, radius, space } from "@/shared/theme/layout";
import { typography } from "@/shared/theme/typography";
import { formatMeetingDuration } from "./meeting-capture-logic";
import { useMeetingCapture } from "./use-meeting-capture";

const WAVE_HEIGHTS = [8, 17, 26, 12, 21, 9, 24, 14, 19, 7, 22, 11] as const;

export function LiveMeetingScreen() {
  const router = useRouter();
  const capture = useMeetingCapture();
  const modelReady = capture.localSttStatus === "ready";
  const isRecording = capture.phase === "recording";
  const busyPhase =
    capture.phase === "starting" || capture.phase === "processing" || capture.phase === "complete"
      ? capture.phase
      : null;

  const openMeeting = (meetingId: string | null) => {
    if (meetingId) router.replace(`/meeting/${meetingId}` as Href);
  };

  return (
    <SafeAreaView style={[styles.safeArea, isRecording && styles.captureSafeArea]}>
      {isRecording ? (
        <View style={styles.captureHeader}>
          <Text numberOfLines={1} style={styles.captureMeetingTitle}>
            {capture.title || "Product sync"}
          </Text>
          <View style={styles.liveLabel}>
            <View style={styles.liveDot} />
            <Text style={styles.captureLabel}>Grabando</Text>
          </View>
          <Text style={styles.captureClock}>{formatMeetingDuration(capture.durationMs)}</Text>
        </View>
      ) : (
        <View style={styles.header}>
          <Pressable
            accessibilityLabel="Volver a Library"
            accessibilityRole="button"
            hitSlop={8}
            onPress={() => router.replace("/")}
            style={styles.headerButton}
          >
            <Icon color={colors.textSecondary} name="chevronLeft" size={22} strokeWidth={2.2} />
          </Pressable>
          <Text style={styles.headerTitle}>Meeting</Text>
          <View style={styles.headerButton} />
        </View>
      )}

      <ScrollView
        contentContainerStyle={[styles.content, isRecording && styles.captureContent]}
        keyboardShouldPersistTaps="handled"
      >
        {capture.phase === "ready" ? (
          <ReadyPhase
            install={capture.installLocalStt}
            memoryTier={capture.localSttMemoryTier}
            modelReady={modelReady}
            progress={capture.localSttProgress}
            setTitle={capture.setTitle}
            sttStatus={capture.localSttStatus}
            title={capture.title}
          />
        ) : null}

        {isRecording ? <RecordingPhase durationMs={capture.durationMs} /> : null}

        {busyPhase ? <BusyPhase durationMs={capture.durationMs} phase={busyPhase} /> : null}

        {capture.phase === "error" ? (
          <ErrorState
            body={
              capture.hasPersistedAudio
                ? `El audio quedó guardado en este dispositivo: son ${describeMinutes(capture.durationMs)}. Parakeet no pudo terminar de procesarlo.`
                : "No se pudo confirmar que el audio quedara guardado. No cierres la app e inténtalo de nuevo."
            }
            detail={capture.error ?? "local-stt: el runtime no devolvió detalle."}
            onRetry={() => void capture.retry().then(openMeeting)}
            title="La transcripción se quedó a medias"
          />
        ) : null}
      </ScrollView>

      <View style={[styles.footer, isRecording && styles.captureFooter]}>
        {isRecording ? (
          <CaptureBar
            onFinish={() => void capture.finish().then(openMeeting)}
            onMark={capture.markMoment}
          />
        ) : null}

        {capture.phase === "ready" ? (
          <Button
            disabled={!modelReady}
            label="Empezar meeting"
            onPress={() => void capture.start()}
            variant="primary"
          />
        ) : null}

        {busyPhase === "starting" || busyPhase === "processing" ? (
          <Text style={styles.footNote}>Se guardará en Library al terminar</Text>
        ) : null}
      </View>
    </SafeAreaView>
  );
}

function ReadyPhase({
  install,
  memoryTier,
  modelReady,
  progress,
  setTitle,
  sttStatus,
  title,
}: {
  install: () => Promise<void>;
  memoryTier: string;
  modelReady: boolean;
  progress: number;
  setTitle: (value: string) => void;
  sttStatus: string;
  title: string;
}) {
  const installing = sttStatus === "downloading" || sttStatus === "extracting";
  const unsupported = memoryTier === "unsupported";

  return (
    <View style={styles.ready}>
      <View style={styles.field}>
        <SectionLabel>Nueva reunión</SectionLabel>
        <View style={styles.fieldRow}>
          <TextInput
            accessibilityLabel="Nombre del meeting"
            onChangeText={setTitle}
            placeholder="Sin título"
            placeholderTextColor={colors.disabled}
            style={styles.fieldInput}
            value={title}
          />
          <Icon color={colors.muted} name="edit" size={17} />
        </View>
      </View>

      <Text style={styles.readyHint}>
        El audio se guarda primero en este iPhone. Al finalizar, tendrás una nota buscable y tus
        momentos marcados.
      </Text>

      {modelReady ? null : (
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Falta el modelo local</Text>
          <Text style={styles.cardBody}>
            {unsupported
              ? "Este dispositivo no tiene memoria suficiente para Parakeet, así que el meeting no puede transcribirse aquí."
              : "Parakeet se instala una vez y el audio del meeting no sale del dispositivo para transcribirse."}
          </Text>
          {unsupported ? null : installing ? (
            <View style={styles.installProgress}>
              <ProgressRing percent={progress} />
              <Text style={styles.cardBody}>
                {sttStatus === "downloading" ? "Descargando el modelo" : "Preparando el modelo"}
              </Text>
            </View>
          ) : (
            <Button icon="import" label="Instalar modelo local" onPress={() => void install()} />
          )}
        </View>
      )}
    </View>
  );
}

function RecordingPhase({ durationMs }: { durationMs: number }) {
  return (
    <View style={styles.recording}>
      <View style={styles.liveTranscript}>
        <Text style={styles.transcriptOld}>
          El audio y la transcripción se quedan en este dispositivo.
        </Text>
        <Text style={styles.transcriptRecent}>Marca los momentos a los que quieras volver.</Text>
        <Text style={styles.transcriptNow}>
          {formatMeetingDuration(durationMs)} · Nada debería impedir que alguien entre en el
          producto<Text style={styles.caret}>▌</Text>
        </Text>
      </View>
    </View>
  );
}

function CaptureBar({ onFinish, onMark }: { onFinish: () => void; onMark: () => void }) {
  const [momentMarked, setMomentMarked] = useState(false);

  const markMoment = () => {
    onMark();
    setMomentMarked(true);
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => undefined);
    setTimeout(() => setMomentMarked(false), 1200);
  };

  return (
    <View style={styles.captureBar}>
      <Pressable
        accessibilityLabel={momentMarked ? "Momento marcado" : "Marcar momento importante"}
        accessibilityRole="button"
        accessibilityState={{ selected: momentMarked }}
        onPress={markMoment}
        style={({ pressed }) => [
          styles.captureAction,
          momentMarked && styles.captureActionMarked,
          pressed && styles.captureActionPressed,
        ]}
      >
        <Icon color={momentMarked ? colors.onAccent : colors.textSecondary} name="bookmark" size={16} />
        <Text style={[styles.captureActionText, momentMarked && styles.captureActionMarkedText]}>
          {momentMarked ? "Marcado" : "Momento"}
        </Text>
      </Pressable>
      <View accessibilityElementsHidden style={styles.wave}>
        {WAVE_HEIGHTS.map((height) => (
          <View key={height} style={[styles.waveBar, { height }]} />
        ))}
      </View>
      <Pressable
        accessibilityLabel="Parar y guardar"
        accessibilityRole="button"
        onPress={() => {
          void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => undefined);
          onFinish();
        }}
        style={({ pressed }) => [
          styles.captureAction,
          styles.stopAction,
          pressed && styles.captureActionPressed,
        ]}
      >
        <Text style={styles.stopIcon}>■</Text>
        <Text style={styles.stopText}>Finalizar</Text>
      </Pressable>
    </View>
  );
}

function BusyPhase({
  durationMs,
  phase,
}: {
  durationMs: number;
  phase: "starting" | "processing" | "complete";
}) {
  if (phase === "starting") {
    return (
      <BusyPanel
        body="Preparando el micrófono y la sesión privada."
        percent={null}
        title="Abriendo el meeting"
      />
    );
  }
  if (phase === "complete") {
    return <BusyPanel body="Ya está en Library." percent={100} title="Meeting guardado" />;
  }
  return (
    <BusyPanel
      body={`${describeMinutes(durationMs)} de audio. Mantén la app abierta mientras termina de transcribirse.`}
      percent={null}
      title="Transcribiendo"
    />
  );
}

function BusyPanel({
  body,
  percent,
  title,
}: {
  body: string;
  percent: number | null;
  title: string;
}) {
  return (
    <View style={styles.busy}>
      <ProgressRing percent={percent} />
      <View style={styles.busyCopy}>
        <Text style={styles.busyTitle}>{title}</Text>
        <Text style={styles.busyBody}>{body}</Text>
      </View>
    </View>
  );
}

const RING_SIZE = 96;
const RING_RADIUS = 45;
const RING_LENGTH = 2 * Math.PI * RING_RADIUS;
/** Arco del anillo cuando no hay cifra: gira en vez de inventarse un número. */
const RING_INDETERMINATE = 0.24;

/**
 * `percent` es `null` cuando no existe una cifra real que enseñar — transcribir
 * no publica progreso — y entonces el anillo gira sin porcentaje.
 */
function ProgressRing({ percent }: { percent: number | null }) {
  const spin = useSharedValue(0);

  useEffect(() => {
    if (percent !== null) return;
    spin.set(
      withRepeat(
        withTiming(1, {
          duration: 1200,
          easing: Easing.linear,
          reduceMotion: ReduceMotion.System,
        }),
        -1,
      ),
    );
    return () => cancelAnimation(spin);
  }, [percent, spin]);

  const spinStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: `${spin.get() * 360}deg` }],
  }));

  const filled = percent === null ? RING_INDETERMINATE : Math.min(100, Math.max(0, percent)) / 100;

  return (
    <View
      accessibilityLabel={percent === null ? "En curso" : `${Math.round(percent)} por ciento`}
      accessibilityRole="progressbar"
      style={styles.ring}
    >
      <Animated.View style={[styles.ringArc, spinStyle]}>
        <Svg height={RING_SIZE} width={RING_SIZE}>
          <Circle
            cx={RING_SIZE / 2}
            cy={RING_SIZE / 2}
            fill="none"
            r={RING_RADIUS}
            stroke={colors.accentSubtle}
            strokeWidth={3}
          />
          <Circle
            cx={RING_SIZE / 2}
            cy={RING_SIZE / 2}
            fill="none"
            r={RING_RADIUS}
            stroke={colors.accent}
            strokeDasharray={`${RING_LENGTH * filled} ${RING_LENGTH}`}
            strokeLinecap="round"
            strokeWidth={3}
            transform={`rotate(-90 ${RING_SIZE / 2} ${RING_SIZE / 2})`}
          />
        </Svg>
      </Animated.View>
      {percent === null ? null : (
        <Text style={styles.ringPercent}>{`${Math.round(percent)}%`}</Text>
      )}
    </View>
  );
}

function describeMinutes(durationMs: number): string {
  const minutes = Math.max(1, Math.round(durationMs / 60000));
  return `${minutes} ${minutes === 1 ? "minuto" : "minutos"}`;
}

const styles = StyleSheet.create({
  busy: { alignItems: "center", flex: 1, gap: 26, justifyContent: "center", paddingBottom: 60 },
  busyBody: { ...typography.body, color: colors.muted, maxWidth: 270, textAlign: "center" },
  busyCopy: { alignItems: "center", gap: space.sm },
  busyTitle: { ...typography.title, color: colors.text, textAlign: "center" },
  card: {
    backgroundColor: colors.surfaceMuted,
    borderColor: colors.border,
    borderCurve: "continuous",
    borderRadius: radius.xl,
    borderWidth: 1,
    gap: 10,
    padding: 17,
  },
  cardBody: { ...typography.body, color: colors.muted },
  cardTitle: { ...typography.item, color: colors.text },
  captureAction: {
    alignItems: "center",
    backgroundColor: "#f0efeb",
    borderRadius: radius.lg,
    flexDirection: "row",
    gap: 6,
    height: 46,
    justifyContent: "center",
    minWidth: 88,
    paddingHorizontal: 10,
  },
  captureActionMarked: { backgroundColor: colors.accent },
  captureActionMarkedText: { color: colors.onAccent },
  captureActionPressed: { opacity: 0.72, transform: [{ scale: 0.96 }] },
  captureActionText: { ...typography.meta, color: colors.textSecondary, fontWeight: "600" },
  captureBar: {
    alignItems: "center",
    backgroundColor: colors.backgroundSecondary,
    borderRadius: 24,
    flexDirection: "row",
    gap: 8,
    padding: 9,
  },
  captureClock: {
    ...typography.meta,
    color: "rgba(255,255,255,0.62)",
    fontVariant: ["tabular-nums"],
  },
  captureContent: { paddingHorizontal: 0, paddingTop: 0 },
  captureFooter: { paddingBottom: 12, paddingHorizontal: 14 },
  captureHeader: {
    alignItems: "center",
    flexDirection: "row",
    gap: 10,
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingVertical: 12,
  },
  captureLabel: { ...typography.meta, color: "rgba(255, 255, 255, 0.62)", fontWeight: "600" },
  captureMeetingTitle: { ...typography.item, color: "#ffffff", flex: 1 },
  captureSafeArea: { backgroundColor: colors.pillShell },
  content: { flexGrow: 1, paddingBottom: space.lg, paddingHorizontal: space.xl, paddingTop: 6 },
  field: { gap: space.sm },
  fieldInput: { ...typography.title, color: colors.text, flex: 1, padding: 0 },
  fieldRow: {
    alignItems: "center",
    borderBottomColor: colors.borderStrong,
    borderBottomWidth: 1,
    flexDirection: "row",
    gap: 10,
    paddingBottom: 11,
  },
  footNote: { ...typography.meta, color: colors.muted, paddingTop: 10, textAlign: "center" },
  footer: { paddingBottom: 30, paddingHorizontal: space.xl, paddingTop: space.md },
  header: {
    alignItems: "center",
    flexDirection: "row",
    height: 48,
    justifyContent: "space-between",
    paddingLeft: 6,
    paddingRight: 10,
  },
  headerButton: {
    alignItems: "center",
    height: hitTarget,
    justifyContent: "center",
    width: hitTarget,
  },
  headerTitle: { ...typography.item, color: colors.textSecondary },
  installProgress: { alignItems: "center", gap: space.md, paddingTop: space.sm },
  liveDot: { backgroundColor: colors.danger, borderRadius: radius.pill, height: 8, width: 8 },
  liveLabel: { alignItems: "center", flexDirection: "row", gap: space.sm },
  momentAt: {
    ...typography.meta,
    color: colors.accent,
    fontVariant: ["tabular-nums"],
    fontWeight: "700",
  },
  momentRow: {
    alignItems: "center",
    backgroundColor: colors.surfaceMuted,
    borderRadius: radius.md,
    flexDirection: "row",
    gap: 11,
    paddingHorizontal: space.md,
    paddingVertical: 9,
  },
  momentText: { ...typography.body, color: colors.textSecondary, flex: 1 },
  ready: { gap: 16, paddingTop: space.md },
  readyHint: { ...typography.body, color: colors.muted, lineHeight: 22, maxWidth: 310 },
  caret: { color: colors.accentLight },
  liveTranscript: {
    flex: 1,
    gap: 16,
    justifyContent: "center",
    paddingHorizontal: 24,
    paddingVertical: 32,
  },
  recording: { flex: 1 },
  ring: { alignItems: "center", height: RING_SIZE, justifyContent: "center", width: RING_SIZE },
  ringArc: { position: "absolute" },
  ringPercent: { ...typography.section, color: colors.text },
  safeArea: { backgroundColor: colors.background, flex: 1 },
  step: { flexDirection: "row", gap: 10 },
  stepIndex: { ...typography.body, color: colors.disabled },
  stepText: { ...typography.body, color: colors.muted, flex: 1 },
  stopAction: { backgroundColor: colors.danger },
  stopIcon: { color: colors.onDanger, fontSize: 10 },
  stopText: { ...typography.meta, color: colors.onDanger, fontWeight: "700" },
  transcriptNow: { ...typography.section, color: colors.onAccent, fontSize: 23, lineHeight: 31 },
  transcriptOld: { ...typography.body, color: "rgba(255,255,255,0.4)", lineHeight: 21 },
  transcriptRecent: { ...typography.body, color: "rgba(255,255,255,0.72)", lineHeight: 22 },
  wave: { alignItems: "center", flex: 1, flexDirection: "row", gap: 3, justifyContent: "center" },
  waveBar: { backgroundColor: "rgba(23,23,27,0.48)", borderRadius: radius.pill, width: 3 },
});
