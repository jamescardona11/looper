import type { MeetingBrief, MeetingContext, MeetingTranscriptSegment } from "@looper/data";
import { useMeetingDetail } from "@looper/data";
import { useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Button } from "@/shared/components/button";
import { Icon } from "@/shared/components/icon";
import { EmptyState } from "@/shared/components/screen-states";
import { SectionLabel } from "@/shared/components/section-label";
import { colors } from "@/shared/theme/colors";
import { hitTarget, radius, relief, space } from "@/shared/theme/layout";
import { typography } from "@/shared/theme/typography";
import { formatMeetingDuration } from "./meeting-capture-logic";

type Section = "summary" | "transcript" | "moments";

const SECTIONS: { id: Section; label: string }[] = [
  { id: "summary", label: "Resumen" },
  { id: "transcript", label: "Transcripción" },
  { id: "moments", label: "Momentos" },
];

/** Título de la nota donde la captura guarda los momentos marcados. */
const MOMENTS_NOTE = "Momentos marcados";

/**
 * Los interlocutores se separan por lightness, no por tono: la paleta tiene un
 * solo acento y el gris es lo único que puede distinguir sin colorear.
 */
const SPEAKER_TONES = [colors.text, colors.textSecondary, colors.muted];

const meetingDateFormatter = new Intl.DateTimeFormat("es", {
  day: "numeric",
  month: "short",
  hour: "numeric",
  minute: "2-digit",
});

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
  const [section, setSection] = useState<Section>("summary");

  if (meeting.isLoading) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <Header onBack={onBack} />
        <View style={styles.body}>
          <DetailSkeleton />
        </View>
      </SafeAreaView>
    );
  }

  if (!meeting.session) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <Header onBack={onBack} />
        <View style={styles.body}>
          <EmptyState
            action={<Button icon="library" label="Volver a Library" onPress={onBack} />}
            body="El meeting ya no está en este dispositivo o nunca llegó a guardarse."
            title="No encontramos este meeting"
          />
        </View>
      </SafeAreaView>
    );
  }

  const session = meeting.session;
  const duration = Math.max(0, (session.endedAt ?? session.lastActiveAt) - session.startedAt);
  const moments = markedMoments(meeting.contexts);

  return (
    <SafeAreaView style={styles.safeArea}>
      <Header onBack={onBack} />

      <View style={styles.titleBlock}>
        <Text style={styles.title}>{session.title}</Text>
        <View style={styles.metaRow}>
          <Text style={styles.meta}>
            {`${meetingDateFormatter.format(session.startedAt)} · ${describeMinutes(duration)}`}
          </Text>
          {meeting.transcript.length > 0 ? (
            <>
              <View style={styles.metaDot} />
              <View style={styles.metaBadge}>
                <Icon color={colors.accent} name="lock" size={12} strokeWidth={2.2} />
                <Text style={styles.metaAccent}>Transcrito en el dispositivo</Text>
              </View>
            </>
          ) : null}
        </View>
      </View>

      <View accessibilityLabel="Secciones del meeting" style={styles.segmented}>
        {SECTIONS.map((item) => {
          const selected = item.id === section;
          return (
            <Pressable
              accessibilityRole="tab"
              accessibilityState={{ selected }}
              key={item.id}
              onPress={() => setSection(item.id)}
              style={[styles.segment, selected && styles.segmentSelected]}
            >
              <Text style={[styles.segmentLabel, selected && styles.segmentLabelSelected]}>
                {item.label}
              </Text>
            </Pressable>
          );
        })}
      </View>

      <ScrollView contentContainerStyle={styles.body}>
        {section === "summary" ? (
          <SummarySection brief={meeting.brief} contexts={meeting.contexts} />
        ) : null}
        {section === "transcript" ? <TranscriptSection transcript={meeting.transcript} /> : null}
        {section === "moments" ? <MomentsSection moments={moments} /> : null}
      </ScrollView>

      <View style={styles.footer}>
        <Pressable
          accessibilityLabel="Pregunta sobre este meeting"
          accessibilityRole="button"
          onPress={() => onAsk(meetingId)}
          style={({ pressed }) => [styles.askBar, pressed && styles.sunk]}
        >
          <Icon color={colors.accent} name="ask" size={18} />
          <Text style={styles.askText}>Pregunta sobre este meeting</Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

function Header({ onBack }: { onBack: () => void }) {
  return (
    <View style={styles.header}>
      <Pressable
        accessibilityLabel="Volver"
        accessibilityRole="button"
        hitSlop={8}
        onPress={onBack}
        style={styles.headerButton}
      >
        <Icon color={colors.textSecondary} name="chevronLeft" size={22} strokeWidth={2.2} />
      </Pressable>
    </View>
  );
}

function SummarySection({
  brief,
  contexts,
}: {
  brief: MeetingBrief | null;
  contexts: MeetingContext[];
}) {
  const notes = contexts.filter(
    (context) => context.kind === "note" && context.title !== MOMENTS_NOTE,
  );
  const decisions = brief?.decisions ?? [];
  const tasks = brief?.tasks ?? [];
  const questions = brief?.questions ?? [];
  const hasBrief = decisions.length + tasks.length + questions.length > 0;

  if (!hasBrief && notes.length === 0) {
    return (
      <SectionNotice
        body="Cuando la transcripción contenga decisiones o tareas, Looper las reunirá aquí. Tus notas del meeting también aparecen en esta pestaña."
        title="Todavía no hay resumen"
      />
    );
  }

  return (
    <View style={styles.sections}>
      {decisions.length > 0 ? <BulletList items={decisions} title="Decisiones" /> : null}
      {tasks.length > 0 ? <BulletList items={tasks} title="Pendientes" /> : null}
      {questions.length > 0 ? <BulletList items={questions} title="Preguntas abiertas" /> : null}
      {notes.map((note) => (
        <View key={note.id} style={styles.block}>
          <SectionLabel>{note.title}</SectionLabel>
          <View style={styles.card}>
            <Text style={styles.cardBody}>{note.content}</Text>
          </View>
        </View>
      ))}
    </View>
  );
}

function BulletList({ items, title }: { items: string[]; title: string }) {
  return (
    <View style={styles.block}>
      <SectionLabel>{title}</SectionLabel>
      {items.map((item) => (
        <View key={item} style={styles.bullet}>
          <View style={styles.bulletDot} />
          <Text style={styles.bulletText}>{item}</Text>
        </View>
      ))}
    </View>
  );
}

function TranscriptSection({ transcript }: { transcript: MeetingTranscriptSegment[] }) {
  if (transcript.length === 0) {
    return (
      <SectionNotice
        body="No se detectó voz, o el meeting todavía no ha terminado de procesarse."
        title="Sin transcripción"
      />
    );
  }

  const speakers = uniqueSpeakers(transcript);

  return (
    <View style={styles.turns}>
      {transcript.map((segment) => {
        const speaker = speakerName(segment);
        const tone = SPEAKER_TONES[speakers.indexOf(speaker) % SPEAKER_TONES.length];
        return (
          <View key={segment.id} style={styles.turn}>
            <View style={styles.turnHead}>
              <View style={[styles.turnDot, { backgroundColor: tone }]} />
              <Text style={[styles.turnSpeaker, { color: tone }]}>{speaker}</Text>
              <Text style={styles.turnAt}>{formatMeetingDuration(segment.timestampMs)}</Text>
            </View>
            <Text style={[styles.turnText, { color: tone }]}>{segment.text}</Text>
          </View>
        );
      })}
    </View>
  );
}

function MomentsSection({ moments }: { moments: number[] }) {
  if (moments.length === 0) {
    return (
      <SectionNotice
        body="Durante la grabación, el botón Momento ancla el minuto exacto para que puedas volver a él."
        title="No marcaste ningún momento"
      />
    );
  }

  return (
    <View style={styles.moments}>
      {moments.map((timestamp, index) => (
        <View key={timestamp} style={styles.momentRow}>
          <View style={styles.momentAtGroup}>
            <Icon color={colors.accent} name="bookmark" size={13} strokeWidth={2.2} />
            <Text style={styles.momentAt}>{formatMeetingDuration(timestamp)}</Text>
          </View>
          <Text style={styles.momentText}>{`Momento ${index + 1}`}</Text>
        </View>
      ))}
    </View>
  );
}

/** Vacío de una sección: cabe en la pestaña y dice qué falta, sin robar la pantalla. */
function SectionNotice({ body, title }: { body: string; title: string }) {
  return (
    <View style={styles.card}>
      <Text style={styles.noticeTitle}>{title}</Text>
      <Text style={styles.cardBody}>{body}</Text>
    </View>
  );
}

/** Esqueleto con la forma del documento: título, meta, segmented y párrafos. */
function DetailSkeleton() {
  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={styles.skeleton}
    >
      <View style={styles.skeletonTitle} />
      <View style={styles.skeletonMeta} />
      <View style={styles.skeletonSegmented} />
      <View style={styles.skeletonLineWide} />
      <View style={styles.skeletonLineWide} />
      <View style={styles.skeletonLineNarrow} />
    </View>
  );
}

function describeMinutes(durationMs: number): string {
  return `${Math.max(1, Math.round(durationMs / 60000))} min`;
}

function markedMoments(contexts: MeetingContext[]): number[] {
  const note = contexts.find((context) => context.title === MOMENTS_NOTE);
  if (!note) return [];
  return note.content
    .split("\n")
    .map((value) => Number(value.trim()))
    .filter((value) => Number.isFinite(value));
}

function speakerName(segment: MeetingTranscriptSegment): string {
  return segment.speaker?.trim() || "Voz";
}

function uniqueSpeakers(transcript: MeetingTranscriptSegment[]): string[] {
  const seen: string[] = [];
  for (const segment of transcript) {
    const name = speakerName(segment);
    if (!seen.includes(name)) seen.push(name);
  }
  return seen;
}

const SEGMENT_HEIGHT = 38;

const styles = StyleSheet.create({
  askBar: {
    ...relief.secondary,
    alignItems: "center",
    borderRadius: radius.xl,
    flexDirection: "row",
    gap: 11,
    minHeight: 52,
    paddingHorizontal: space.lg,
  },
  askText: { ...typography.body, color: colors.muted, flex: 1 },
  block: { gap: 10 },
  body: { flexGrow: 1, paddingBottom: space.xxl, paddingHorizontal: space.xl },
  bullet: { flexDirection: "row", gap: 11 },
  bulletDot: {
    backgroundColor: colors.accent,
    borderRadius: radius.pill,
    height: 5,
    marginTop: 9,
    width: 5,
  },
  bulletText: { ...typography.body, color: colors.text, flex: 1, lineHeight: 23 },
  card: {
    backgroundColor: colors.surfaceMuted,
    borderColor: colors.border,
    borderCurve: "continuous",
    borderRadius: radius.lg,
    borderWidth: 1,
    gap: space.sm,
    padding: 15,
  },
  cardBody: { ...typography.body, color: colors.muted },
  footer: { paddingBottom: 30, paddingHorizontal: space.xl, paddingTop: space.md },
  header: { flexDirection: "row", height: 46, paddingLeft: 6 },
  headerButton: {
    alignItems: "center",
    height: hitTarget,
    justifyContent: "center",
    width: hitTarget,
  },
  meta: { ...typography.meta, color: colors.muted },
  metaAccent: { ...typography.meta, color: colors.accent, fontWeight: "600" },
  metaBadge: { alignItems: "center", flexDirection: "row", gap: 5 },
  metaDot: {
    backgroundColor: colors.borderStrong,
    borderRadius: radius.pill,
    height: 3,
    width: 3,
  },
  metaRow: { alignItems: "center", flexDirection: "row", flexWrap: "wrap", gap: 9 },
  momentAt: {
    ...typography.meta,
    color: colors.accent,
    fontVariant: ["tabular-nums"],
    fontWeight: "700",
  },
  momentAtGroup: { alignItems: "center", flexDirection: "row", gap: 6, paddingTop: 1 },
  momentRow: {
    alignItems: "flex-start",
    backgroundColor: colors.surfaceMuted,
    borderColor: colors.border,
    borderRadius: radius.lg,
    borderWidth: 1,
    flexDirection: "row",
    gap: 13,
    paddingHorizontal: 15,
    paddingVertical: 14,
  },
  momentText: { ...typography.body, color: colors.textSecondary, flex: 1 },
  moments: { gap: 9 },
  noticeTitle: { ...typography.item, color: colors.text },
  safeArea: { backgroundColor: colors.background, flex: 1 },
  sections: { gap: 22 },
  segment: {
    alignItems: "center",
    borderRadius: radius.md,
    flex: 1,
    height: SEGMENT_HEIGHT,
    justifyContent: "center",
  },
  segmentLabel: { ...typography.meta, color: colors.muted, fontWeight: "600" },
  segmentLabelSelected: { color: colors.text, fontWeight: "700" },
  segmentSelected: { backgroundColor: colors.surface },
  segmented: {
    backgroundColor: colors.surfaceMuted,
    borderColor: colors.border,
    borderRadius: radius.lg,
    borderWidth: 1,
    flexDirection: "row",
    gap: space.xs,
    marginBottom: 14,
    marginHorizontal: space.xl,
    padding: space.xs,
  },
  skeleton: { gap: 14, paddingTop: space.sm },
  skeletonLineNarrow: {
    backgroundColor: colors.surfaceMuted,
    borderRadius: radius.xs,
    height: 12,
    width: "55%",
  },
  skeletonLineWide: {
    backgroundColor: colors.surfaceMuted,
    borderRadius: radius.xs,
    height: 12,
  },
  skeletonMeta: {
    backgroundColor: colors.surfaceMuted,
    borderRadius: radius.xs,
    height: 12,
    width: "60%",
  },
  skeletonSegmented: {
    backgroundColor: colors.surfaceMuted,
    borderRadius: radius.lg,
    height: 48,
    marginVertical: space.sm,
  },
  skeletonTitle: {
    backgroundColor: colors.surface,
    borderRadius: radius.sm,
    height: 28,
    width: "80%",
  },
  sunk: relief.pressed,
  title: { ...typography.display, color: colors.text },
  titleBlock: { gap: 11, paddingBottom: 14, paddingHorizontal: space.xl },
  turn: { gap: 5 },
  turnAt: {
    ...typography.meta,
    color: colors.disabled,
    fontVariant: ["tabular-nums"],
    fontWeight: "700",
  },
  turnDot: { borderRadius: radius.pill, height: 7, width: 7 },
  turnHead: { alignItems: "center", flexDirection: "row", gap: space.sm },
  turnSpeaker: { ...typography.meta, fontWeight: "600" },
  turnText: { ...typography.body, lineHeight: 23, paddingLeft: 15 },
  turns: { gap: 18 },
});
