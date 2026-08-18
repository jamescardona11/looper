import { type Href, useRouter } from "expo-router";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { PillListeningSignal } from "@/shared/components/pill-listening-signal";
import { colors } from "@/shared/theme/colors";
import { useMeetingCapture } from "./use-meeting-capture";

export function LiveMeetingScreen() {
  const router = useRouter();
  const capture = useMeetingCapture();
  const isReady = capture.phase === "ready";
  const isRecording = capture.phase === "recording";

  const finish = async () => {
    const meetingId = await capture.finish();
    if (meetingId) router.replace(`/meeting/${meetingId}` as Href);
  };
  const retry = async () => {
    const meetingId = await capture.retry();
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
          <Text style={styles.headerButtonText}>‹</Text>
        </Pressable>
        <Text style={styles.headerTitle}>Meeting</Text>
        <View style={styles.headerButton} />
      </View>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        {isReady ? (
          <ReadyState
            install={capture.installLocalStt}
            memoryTier={capture.localSttMemoryTier}
            progress={capture.localSttProgress}
            setTitle={capture.setTitle}
            start={capture.start}
            sttStatus={capture.localSttStatus}
            title={capture.title}
          />
        ) : null}
        {isRecording ? (
          <View style={styles.recordingWorkspace}>
            <View style={styles.captureHead}>
              <View style={styles.liveLabel}><View style={styles.liveDot} /><Text style={styles.liveText}>Grabando</Text></View>
              <PillListeningSignal active elapsedMs={capture.durationMs} level={capture.audioLevel} />
              <Text style={styles.source}>Micrófono del dispositivo</Text>
            </View>
            <View style={styles.noticeCard}>
              <Text style={styles.noticeLabel}>TRANSCRIPCIÓN</Text>
              <Text style={styles.noticeBody}>Parakeet procesará el audio localmente al terminar. Tus notas y momentos ya quedan unidos a este meeting.</Text>
            </View>
            {capture.moments.length > 0 ? (
              <Text accessibilityLiveRegion="polite" style={styles.markedCopy}>
                {capture.moments.length} {capture.moments.length === 1 ? "momento marcado" : "momentos marcados"}
              </Text>
            ) : null}
            <View style={styles.notesCard}>
              <Text style={styles.notesLabel}>MIS NOTAS</Text>
              <TextInput
                multiline
                onChangeText={capture.setNotes}
                placeholder="Escribe mientras Looper escucha…"
                placeholderTextColor={colors.muted}
                style={styles.notesInput}
                textAlignVertical="top"
                value={capture.notes}
              />
            </View>
          </View>
        ) : null}
        {capture.phase === "starting" || capture.phase === "processing" ? (
          <ProcessingState phase={capture.phase} />
        ) : null}
        {capture.phase === "error" ? (
          <View style={styles.centerState}>
            <Text style={styles.stateTitle}>El meeting necesita atención</Text>
            <Text style={styles.stateBody}>{capture.error ?? "No se pudo continuar."}</Text>
            <Pressable onPress={() => void retry()} style={styles.primaryButton}>
              <Text style={styles.primaryText}>Reintentar procesamiento</Text>
            </Pressable>
          </View>
        ) : null}
      </ScrollView>
      {isRecording ? (
        <View style={styles.captureActions}>
          <Pressable onPress={capture.markMoment} style={styles.markButton}>
            <Text style={styles.markText}>Marcar momento</Text>
          </Pressable>
          <Pressable onPress={() => void finish()} style={styles.stopButton}>
            <Text style={styles.stopText}>Terminar</Text>
          </Pressable>
        </View>
      ) : null}
    </SafeAreaView>
  );
}

function ReadyState({
  title,
  setTitle,
  sttStatus,
  progress,
  memoryTier,
  install,
  start,
}: {
  title: string;
  setTitle: (value: string) => void;
  sttStatus: string;
  progress: number;
  memoryTier: string;
  install: () => Promise<void>;
  start: () => Promise<boolean>;
}) {
  const modelReady = sttStatus === "ready";
  const installing = sttStatus === "downloading" || sttStatus === "extracting" || sttStatus === "checking";
  const installLabel =
    sttStatus === "downloading"
      ? `Descargando ${progress}%`
      : sttStatus === "extracting"
        ? `Preparando ${progress}%`
        : "Comprobando modelo";
  return (
    <View style={styles.readyState}>
      <Text style={styles.heroEyebrow}>LIVE MEETING COMPANION</Text>
      <Text style={styles.heroTitle}>Toma notas sin perder la conversación.</Text>
      <Text style={styles.heroBody}>Looper graba, transcribe localmente y convierte el resultado en un documento consultable.</Text>
      <View style={styles.field}>
        <Text style={styles.fieldLabel}>Nombre</Text>
        <TextInput onChangeText={setTitle} placeholderTextColor={colors.muted} style={styles.titleInput} value={title} />
      </View>
      {!modelReady ? (
        <View style={styles.modelCard}>
          <Text style={styles.modelTitle}>Dictado local requerido</Text>
          <Text style={styles.modelBody}>{memoryTier === "unsupported" ? "Este dispositivo no tiene memoria suficiente para Parakeet." : "Instala Parakeet una vez. El audio del meeting no sale del dispositivo para transcribirse."}</Text>
          {memoryTier !== "unsupported" ? (
            <Pressable disabled={installing} onPress={() => void install()} style={[styles.secondaryButton, installing && styles.disabled]}>
              <Text style={styles.secondaryText}>{installing ? installLabel : "Instalar modelo local"}</Text>
            </Pressable>
          ) : null}
        </View>
      ) : null}
      <Pressable disabled={!modelReady} onPress={() => void start()} style={[styles.primaryButton, !modelReady && styles.disabled]}>
        <Text style={styles.primaryText}>Empezar meeting</Text>
      </Pressable>
    </View>
  );
}

function ProcessingState({ phase }: { phase: "starting" | "processing" }) {
  return (
    <View style={styles.centerState}>
      <ActivityIndicator color={colors.accent} size="large" />
      <Text style={styles.stateTitle}>{phase === "starting" ? "Abriendo el meeting" : "Organizando la reunión"}</Text>
      <Text style={styles.stateBody}>{phase === "starting" ? "Preparando el micrófono y la sesión privada." : "Parakeet transcribe el audio y Looper une tus notas y momentos marcados."}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  safeArea: { backgroundColor: colors.background, flex: 1 },
  header: { alignItems: "center", borderBottomColor: colors.border, borderBottomWidth: StyleSheet.hairlineWidth, flexDirection: "row", minHeight: 54, paddingHorizontal: 14 },
  headerButton: { alignItems: "center", height: 44, justifyContent: "center", width: 44 },
  headerButtonText: { color: colors.textSecondary, fontSize: 30, lineHeight: 34 },
  headerTitle: { color: colors.text, flex: 1, fontSize: 16, fontWeight: "700", textAlign: "center" },
  content: { flexGrow: 1, padding: 20, paddingBottom: 116 },
  readyState: { gap: 18 },
  heroEyebrow: { color: colors.accentLight, fontSize: 11, fontWeight: "800", letterSpacing: 1 },
  heroTitle: { color: colors.text, fontSize: 30, fontWeight: "700", letterSpacing: -0.9, lineHeight: 35 },
  heroBody: { color: colors.textSecondary, fontSize: 15, lineHeight: 22 },
  field: { gap: 7 },
  fieldLabel: { color: colors.muted, fontSize: 12, fontWeight: "700" },
  titleInput: { backgroundColor: colors.backgroundSecondary, borderColor: colors.border, borderRadius: 12, borderWidth: 1, color: colors.text, fontSize: 16, minHeight: 48, paddingHorizontal: 14 },
  modelCard: { backgroundColor: colors.backgroundSecondary, borderColor: colors.border, borderCurve: "continuous", borderRadius: 16, borderWidth: 1, gap: 10, padding: 16 },
  modelTitle: { color: colors.text, fontSize: 16, fontWeight: "700" },
  modelBody: { color: colors.textSecondary, lineHeight: 20 },
  primaryButton: { alignItems: "center", backgroundColor: colors.accent, borderCurve: "continuous", borderRadius: 14, justifyContent: "center", minHeight: 50, paddingHorizontal: 18 },
  primaryText: { color: colors.onAccent, fontSize: 15, fontWeight: "800" },
  secondaryButton: { alignItems: "center", alignSelf: "flex-start", borderColor: colors.borderStrong, borderRadius: 11, borderWidth: 1, minHeight: 44, justifyContent: "center", paddingHorizontal: 14 },
  secondaryText: { color: colors.text, fontSize: 13, fontWeight: "700" },
  disabled: { backgroundColor: colors.surfaceElevated, opacity: 0.65 },
  recordingWorkspace: { gap: 16 },
  captureHead: { alignItems: "center", gap: 7, paddingTop: 10 },
  liveLabel: { alignItems: "center", flexDirection: "row", gap: 8 },
  liveDot: { backgroundColor: colors.danger, borderRadius: 99, height: 8, width: 8 },
  liveText: { color: colors.textSecondary, fontSize: 12, fontWeight: "700" },
  source: { color: colors.muted, fontSize: 12 },
  noticeCard: { backgroundColor: colors.surfaceMuted, borderColor: colors.border, borderCurve: "continuous", borderRadius: 15, borderWidth: 1, gap: 9, padding: 15 },
  noticeLabel: { color: colors.muted, fontSize: 11, fontWeight: "800", letterSpacing: 0.7 },
  noticeBody: { color: colors.textSecondary, fontSize: 14, lineHeight: 21 },
  markedCopy: { color: colors.accentLight, fontSize: 13, fontWeight: "700" },
  notesCard: { backgroundColor: colors.backgroundSecondary, borderColor: colors.border, borderCurve: "continuous", borderRadius: 15, borderWidth: 1, gap: 8, padding: 15 },
  notesLabel: { color: colors.muted, fontSize: 11, fontWeight: "800", letterSpacing: 0.7 },
  notesInput: { color: colors.text, fontSize: 15, lineHeight: 22, minHeight: 150, padding: 0 },
  centerState: { alignItems: "center", flex: 1, gap: 12, justifyContent: "center", minHeight: 480 },
  stateTitle: { color: colors.text, fontSize: 22, fontWeight: "700", textAlign: "center" },
  stateBody: { color: colors.textSecondary, lineHeight: 21, maxWidth: 300, textAlign: "center" },
  captureActions: { backgroundColor: colors.background, borderTopColor: colors.border, borderTopWidth: StyleSheet.hairlineWidth, bottom: 0, flexDirection: "row", gap: 10, left: 0, padding: 14, paddingBottom: 20, position: "absolute", right: 0 },
  markButton: { alignItems: "center", backgroundColor: colors.surface, borderColor: colors.borderStrong, borderRadius: 14, borderWidth: 1, flex: 1, justifyContent: "center", minHeight: 52 },
  markText: { color: colors.text, fontSize: 13, fontWeight: "700" },
  stopButton: { alignItems: "center", backgroundColor: colors.danger, borderRadius: 14, flex: 1.25, justifyContent: "center", minHeight: 52 },
  stopText: { color: colors.onDanger, fontSize: 15, fontWeight: "800" },
});
