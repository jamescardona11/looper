import type { MeetingBrief, MeetingContext, MeetingTranscriptSegment } from "@looper/data";
import { useMeetingDetail } from "@looper/data";
import React from "react";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { colors } from "@/shared/theme/colors";
import { formatMeetingDuration } from "./meeting-capture-logic";

type DetailTab = "summary" | "notes" | "transcript";
const meetingDateFormatter = new Intl.DateTimeFormat("es", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });

export function MeetingDetailScreen({
  meetingId,
  onBack,
  onAsk,
}: {
  meetingId: string;
  onBack: () => void;
  onAsk: (meetingId: string) => void;
}) {
  const meeting = useMeetingDetail(meetingId);
  const [tab, setTab] = React.useState<DetailTab>("summary");

  if (meeting.isLoading) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.loading}><ActivityIndicator color={colors.accent} size="large" /></View>
      </SafeAreaView>
    );
  }

  if (!meeting.session) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.loading}>
          <Text style={styles.emptyTitle}>No encontramos este meeting.</Text>
          <Pressable onPress={onBack} style={styles.secondaryButton}><Text style={styles.secondaryText}>Volver</Text></Pressable>
        </View>
      </SafeAreaView>
    );
  }

  const duration = Math.max(
    0,
    (meeting.session.endedAt ?? meeting.session.lastActiveAt) - meeting.session.startedAt,
  );

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.header}>
        <Pressable accessibilityLabel="Volver" accessibilityRole="button" hitSlop={8} onPress={onBack} style={styles.headerButton}><Text style={styles.backText}>‹</Text></Pressable>
        <View style={styles.headerCopy}>
          <Text numberOfLines={1} style={styles.title}>{meeting.session.title}</Text>
          <Text style={styles.saved}>Guardado · {formatDate(meeting.session.lastActiveAt)}</Text>
        </View>
        <View style={styles.headerButton} />
      </View>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.metaRow}>
          <Text style={styles.meta}>{formatDate(meeting.session.startedAt)}</Text>
          <Text style={styles.meta}>{formatMeetingDuration(duration)}</Text>
          <Text style={styles.meta}>{meeting.transcript.length} segmentos</Text>
        </View>
        <View accessibilityLabel="Secciones del meeting" style={styles.tabs}>
          {(["summary", "notes", "transcript"] as const).map((id) => (
            <Pressable
              accessibilityRole="tab"
              accessibilityState={{ selected: tab === id }}
              key={id}
              onPress={() => setTab(id)}
              style={[styles.tab, tab === id && styles.activeTab]}
            >
              <Text style={[styles.tabText, tab === id && styles.activeTabText]}>{tabLabel(id)}</Text>
            </Pressable>
          ))}
        </View>
        {tab === "summary" ? <SummaryTab brief={meeting.brief} /> : null}
        {tab === "notes" ? <NotesTab contexts={meeting.contexts} /> : null}
        {tab === "transcript" ? <TranscriptTab transcript={meeting.transcript} /> : null}
        <Pressable accessibilityRole="button" onPress={() => onAsk(meetingId)} style={styles.askButton}>
          <Text style={styles.askText}>Preguntar sobre este meeting</Text>
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}

function SummaryTab({ brief }: { brief: MeetingBrief | null }) {
  if (!brief || (brief.decisions.length === 0 && brief.tasks.length === 0 && brief.questions.length === 0)) {
    return <EmptySection title="Todavía no hay resumen" body="Cuando la transcripción contiene decisiones o tareas, Looper las reúne aquí." />;
  }
  return (
    <View style={styles.document}>
      <DocumentSection title="Decisiones" items={brief.decisions} empty="No se detectaron decisiones." />
      <DocumentSection title="Próximas acciones" items={brief.tasks} empty="No se detectaron tareas." />
      <DocumentSection title="Preguntas abiertas" items={brief.questions} empty="No quedaron preguntas abiertas." />
    </View>
  );
}

function NotesTab({ contexts }: { contexts: MeetingContext[] }) {
  const notes = contexts.filter((context) => context.kind === "note");
  if (notes.length === 0) return <EmptySection title="Sin notas manuales" body="Las notas escritas durante el meeting aparecerán aquí." />;
  return (
    <View style={styles.document}>
      {notes.map((note) => (
        <View key={note.id} style={styles.section}>
          <Text style={styles.sectionTitle}>{note.title}</Text>
          {note.title === "Momentos marcados" ? (
            note.content.split("\n").map((value) => <Text key={value} style={styles.body}>• {formatMeetingDuration(Number(value))}</Text>)
          ) : (
            <Text style={styles.body}>{note.content}</Text>
          )}
        </View>
      ))}
    </View>
  );
}

function TranscriptTab({ transcript }: { transcript: MeetingTranscriptSegment[] }) {
  if (transcript.length === 0) return <EmptySection title="Sin transcripción" body="No se detectó voz o el meeting todavía no terminó de procesarse." />;
  return (
    <View style={styles.document}>
      {transcript.map((segment) => (
        <View key={segment.id} style={styles.section}>
          <Text style={styles.sectionTitle}>{formatMeetingDuration(segment.timestampMs)}{segment.speaker ? ` · ${segment.speaker}` : ""}</Text>
          <Text style={styles.body}>{segment.text}</Text>
        </View>
      ))}
    </View>
  );
}

function DocumentSection({ title, items, empty }: { title: string; items: string[]; empty: string }) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {items.length > 0 ? items.map((item, index) => <Text key={`${index}-${item}`} style={styles.body}>• {item}</Text>) : <Text style={styles.mutedBody}>{empty}</Text>}
    </View>
  );
}

function EmptySection({ title, body }: { title: string; body: string }) {
  return <View style={styles.emptySection}><Text style={styles.emptyTitle}>{title}</Text><Text style={styles.mutedBody}>{body}</Text></View>;
}

function tabLabel(tab: DetailTab): string {
  if (tab === "summary") return "Resumen";
  if (tab === "notes") return "Mis notas";
  return "Transcript";
}

function formatDate(timestamp: number): string {
  return meetingDateFormatter.format(timestamp);
}

const styles = StyleSheet.create({
  safeArea: { backgroundColor: colors.background, flex: 1 },
  loading: { alignItems: "center", flex: 1, gap: 14, justifyContent: "center", padding: 24 },
  header: { alignItems: "center", borderBottomColor: colors.border, borderBottomWidth: StyleSheet.hairlineWidth, flexDirection: "row", minHeight: 58, paddingHorizontal: 12 },
  headerButton: { alignItems: "center", height: 44, justifyContent: "center", width: 44 },
  backText: { color: colors.textSecondary, fontSize: 30, lineHeight: 34 },
  headerCopy: { flex: 1, gap: 3 },
  title: { color: colors.text, fontSize: 18, fontWeight: "700" },
  saved: { color: colors.muted, fontSize: 11 },
  content: { padding: 18, paddingBottom: 38 },
  metaRow: { flexDirection: "row", flexWrap: "wrap", gap: 12, paddingBottom: 16 },
  meta: { color: colors.muted, fontSize: 12 },
  tabs: { borderBottomColor: colors.border, borderBottomWidth: 1, flexDirection: "row", marginBottom: 20 },
  tab: { borderBottomColor: "transparent", borderBottomWidth: 2, minHeight: 44, justifyContent: "center", paddingHorizontal: 12 },
  activeTab: { borderBottomColor: colors.accent },
  tabText: { color: colors.muted, fontSize: 13, fontWeight: "700" },
  activeTabText: { color: colors.text },
  document: { gap: 20 },
  section: { borderBottomColor: colors.border, borderBottomWidth: StyleSheet.hairlineWidth, gap: 8, paddingBottom: 18 },
  sectionTitle: { color: colors.text, fontSize: 15, fontWeight: "700" },
  body: { color: colors.textSecondary, fontSize: 14, lineHeight: 22 },
  mutedBody: { color: colors.muted, fontSize: 14, lineHeight: 21 },
  emptySection: { alignItems: "center", backgroundColor: colors.backgroundSecondary, borderColor: colors.border, borderRadius: 16, borderWidth: 1, gap: 8, padding: 28 },
  emptyTitle: { color: colors.text, fontSize: 17, fontWeight: "700", textAlign: "center" },
  askButton: { alignItems: "center", borderColor: colors.borderStrong, borderRadius: 13, borderWidth: 1, justifyContent: "center", marginTop: 24, minHeight: 48 },
  askText: { color: colors.text, fontSize: 13, fontWeight: "700" },
  secondaryButton: { borderColor: colors.borderStrong, borderRadius: 12, borderWidth: 1, minHeight: 44, justifyContent: "center", paddingHorizontal: 16 },
  secondaryText: { color: colors.text, fontWeight: "700" },
});
