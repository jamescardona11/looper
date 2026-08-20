import { type Href, useRouter } from "expo-router";
import { type RefObject, useEffect, useRef } from "react";
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
import { Chip } from "@/shared/components/chip";
import { Icon } from "@/shared/components/icon";
import { PillListeningSignal } from "@/shared/components/pill-listening-signal";
import { ErrorState } from "@/shared/components/screen-states";
import { SectionLabel } from "@/shared/components/section-label";
import { colors } from "@/shared/theme/colors";
import { hitTarget, radius, space } from "@/shared/theme/layout";
import { typography } from "@/shared/theme/typography";
import { formatMeetingDuration } from "./meeting-capture-logic";
import { useMeetingCapture } from "./use-meeting-capture";

const STEPS = [
  "Looper graba mientras tú escribes lo que quieras.",
  "Al terminar, Parakeet transcribe sin conexión.",
  "Queda un documento buscable, con tus momentos marcados.",
];

export function LiveMeetingScreen() {
  const router = useRouter();
  const capture = useMeetingCapture();
  const notesRef = useRef<TextInput>(null);
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
    <SafeAreaView style={styles.safeArea}>
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

      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
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

        {isRecording ? (
          <RecordingPhase
            audioLevel={capture.audioLevel}
            durationMs={capture.durationMs}
            moments={capture.moments}
            notes={capture.notes}
            notesRef={notesRef}
            setNotes={capture.setNotes}
          />
        ) : null}

        {busyPhase ? <BusyPhase durationMs={capture.durationMs} phase={busyPhase} /> : null}

        {capture.phase === "error" ? (
          <ErrorState
            body={`El audio está a salvo: son ${describeMinutes(capture.durationMs)} y no se ha perdido nada. Parakeet no pudo terminar de procesarlo.`}
            detail={capture.error ?? "local-stt: el runtime no devolvió detalle."}
            onRetry={() => void capture.retry().then(openMeeting)}
            title="La transcripción se quedó a medias"
          />
        ) : null}
      </ScrollView>

      <View style={styles.footer}>
        {isRecording ? (
          <View style={styles.actionRow}>
            <View style={styles.action}>
              <Button icon="bookmark" label="Momento" onPress={capture.markMoment} />
            </View>
            <View style={styles.action}>
              <Button icon="edit" label="Nota" onPress={() => notesRef.current?.focus()} />
            </View>
          </View>
        ) : null}

        {capture.phase === "ready" ? (
          <Button
            disabled={!modelReady}
            label="Empezar meeting"
            onPress={() => void capture.start()}
            variant="primary"
          />
        ) : null}

        {isRecording ? (
          <Button
            label="Terminar y transcribir"
            onPress={() => void capture.finish().then(openMeeting)}
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
      <View style={styles.chipRow}>
        <Chip
          icon="lock"
          label={modelReady ? "Parakeet · en el dispositivo" : "Parakeet · sin instalar"}
          selected={modelReady}
        />
      </View>

      <View style={styles.field}>
        <SectionLabel>Nombre</SectionLabel>
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

      <View style={styles.card}>
        <Text style={styles.cardTitle}>Qué va a pasar</Text>
        {STEPS.map((step, index) => (
          <View key={step} style={styles.step}>
            <Text style={styles.stepIndex}>{index + 1}</Text>
            <Text style={styles.stepText}>{step}</Text>
          </View>
        ))}
      </View>

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

function RecordingPhase({
  audioLevel,
  durationMs,
  moments,
  notes,
  notesRef,
  setNotes,
}: {
  audioLevel: number;
  durationMs: number;
  moments: number[];
  notes: string;
  notesRef: RefObject<TextInput | null>;
  setNotes: (value: string) => void;
}) {
  return (
    <View style={styles.recording}>
      <View style={styles.recordingHead}>
        <View style={styles.liveLabel}>
          <View style={styles.liveDot} />
          <SectionLabel>Grabando</SectionLabel>
        </View>
        <Text style={styles.timer}>{formatMeetingDuration(durationMs)}</Text>
        <PillListeningSignal active elapsedMs={durationMs} level={audioLevel} />
      </View>

      <View style={styles.moments}>
        <View style={styles.momentsHead}>
          <SectionLabel>{`Momentos · ${moments.length}`}</SectionLabel>
          <View style={styles.rule} />
        </View>
        {moments.length === 0 ? (
          <Text style={styles.momentsHint}>
            Marca un momento y queda anclado al minuto exacto de la grabación.
          </Text>
        ) : (
          moments.map((timestamp, index) => (
            <View key={timestamp} style={styles.momentRow}>
              <Icon color={colors.accent} name="bookmark" size={14} strokeWidth={2.2} />
              <Text style={styles.momentAt}>{formatMeetingDuration(timestamp)}</Text>
              <Text numberOfLines={1} style={styles.momentText}>{`Momento ${index + 1}`}</Text>
            </View>
          ))
        )}
      </View>

      <View style={styles.notesCard}>
        <SectionLabel>Mis notas</SectionLabel>
        <TextInput
          accessibilityLabel="Mis notas"
          multiline
          onChangeText={setNotes}
          placeholder="Escribe mientras Looper escucha…"
          placeholderTextColor={colors.disabled}
          ref={notesRef}
          style={styles.notesInput}
          textAlignVertical="top"
          value={notes}
        />
      </View>
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
      body={`${describeMinutes(durationMs)} de audio, sin conexión. Puedes cerrar la app: sigue al volver.`}
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
  action: { flex: 1 },
  actionRow: { flexDirection: "row", gap: 10, marginBottom: 10 },
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
  chipRow: { alignItems: "flex-start" },
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
  liveDot: { backgroundColor: colors.accent, borderRadius: radius.pill, height: 8, width: 8 },
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
  moments: { gap: 9 },
  momentsHead: { alignItems: "center", flexDirection: "row", gap: space.sm },
  momentsHint: { ...typography.meta, color: colors.muted },
  notesCard: {
    backgroundColor: colors.surfaceMuted,
    borderColor: colors.border,
    borderCurve: "continuous",
    borderRadius: radius.lg,
    borderWidth: 1,
    gap: space.sm,
    padding: 15,
  },
  notesInput: { ...typography.body, color: colors.textSecondary, minHeight: 120, padding: 0 },
  ready: { gap: 22 },
  recording: { gap: space.xl },
  recordingHead: { alignItems: "center", gap: 14 },
  ring: { alignItems: "center", height: RING_SIZE, justifyContent: "center", width: RING_SIZE },
  ringArc: { position: "absolute" },
  ringPercent: { ...typography.section, color: colors.text },
  rule: { backgroundColor: colors.border, flex: 1, height: 1 },
  safeArea: { backgroundColor: colors.background, flex: 1 },
  step: { flexDirection: "row", gap: 10 },
  stepIndex: { ...typography.body, color: colors.disabled },
  stepText: { ...typography.body, color: colors.muted, flex: 1 },
  timer: { ...typography.display, color: colors.text, fontVariant: ["tabular-nums"] },
});
