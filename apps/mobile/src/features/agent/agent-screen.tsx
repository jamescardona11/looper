import { type ChatMessage, type MeetingSession, type Note, useMeetingSessions, useNotes } from "@looper/data";
import { type Href, useRouter } from "expo-router";
import { useRef, useState } from "react";
import {
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Icon, type IconName } from "@/shared/components/icon";
import { ErrorState } from "@/shared/components/screen-states";
import { SectionLabel } from "@/shared/components/section-label";
import { colors } from "@/shared/theme/colors";
import { hitTarget, radius, relief, space } from "@/shared/theme/layout";
import { typography } from "@/shared/theme/typography";
import { answerParts, type AgentCitation } from "./agent-logic";
import { useMobileAgent } from "./use-mobile-agent";

const SUGGESTIONS = [
  "¿Qué decisiones tomamos esta semana?",
  "Lista mis pendientes recientes",
  "Resume lo que capturé sobre onboarding",
];

const CITATION_ICON: Record<AgentCitation["kind"], IconName> = {
  Dictation: "dictado",
  Meeting: "meeting",
  Note: "nota",
};

export function AgentScreen({ meetingId }: { meetingId?: string }) {
  const agent = useMobileAgent(meetingId);
  const router = useRouter();
  const notes = useNotes();
  const meetings = useMeetingSessions();
  const [draft, setDraft] = useState("");
  const [hiddenThrough, setHiddenThrough] = useState<string | null>(null);
  const [suggestionsOpen, setSuggestionsOpen] = useState(false);
  const listRef = useRef<FlatList<ChatMessage>>(null);

  // Una conversación nueva se pide sin borrar el hilo: se corta por el último
  // mensaje visto. Si ese mensaje ya no está, el corte se cae solo y vuelve todo.
  const cut = hiddenThrough ? agent.messages.findIndex((item) => item._id === hiddenThrough) : -1;
  const messages = agent.messages.slice(cut + 1);
  const lastQuestion = messages.reduce(
    (found, item) => (item.role === "user" ? item.content : found),
    "",
  );
  const resolveCitation = (citation: AgentCitation) =>
    citationTarget(citation, notes.notes, meetings.sessions);
  const openCitation = (citation: AgentCitation) => {
    const target = resolveCitation(citation);
    if (target) router.push(target);
  };

  const submit = async (value = draft) => {
    if (!value.trim() || agent.isBusy) return;
    setDraft("");
    await agent.send(value);
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        keyboardVerticalOffset={0}
        style={styles.keyboard}
      >
        <View style={styles.header}>
          <View>
            <Text style={styles.kicker}>PREGUNTAR</Text>
            <Text accessibilityRole="header" style={styles.title}>
              Lo que ya dijiste
            </Text>
          </View>
          {messages.length ? (
            <Pressable
              accessibilityLabel="Nueva conversación"
              accessibilityRole="button"
              onPress={() => setHiddenThrough(agent.messages.at(-1)?._id ?? null)}
              style={styles.reset}
            >
              <Icon color={colors.textSecondary} name="plus" />
            </Pressable>
          ) : null}
        </View>

        <FlatList
          contentContainerStyle={styles.timeline}
          data={messages}
          keyboardShouldPersistTaps="handled"
          keyExtractor={(item) => item._id}
          ListFooterComponent={
            messages.some((item) => item.role === "assistant" && item.content.trim().length > 0) ? (
              <FollowUpSuggestions onSubmit={(suggestion) => void submit(suggestion)} />
            ) : null
          }
          ListEmptyComponent={
            agent.isLoading ? (
              <ThreadSkeleton />
            ) : (
              <AskStarter
                expanded={suggestionsOpen}
                onToggle={() => setSuggestionsOpen((current) => !current)}
                onSubmit={(suggestion) => void submit(suggestion)}
              />
            )
          }
          onContentSizeChange={() => listRef.current?.scrollToEnd({ animated: true })}
          ref={listRef}
          renderItem={({ item }) => (
            <MessageRow
              message={item}
              onOpenCitation={openCitation}
              resolveCitation={resolveCitation}
            />
          )}
        />

        {agent.error ? (
          <View style={styles.errorSlot}>
            <ErrorState
              body="Tu pregunta y todo lo capturado siguen guardados. Puedes volver a preguntar."
              detail={agent.error}
              onRetry={() => void submit(lastQuestion)}
              title="No se pudo responder"
            />
          </View>
        ) : null}

        <View style={styles.composerSlot}>
          <View style={styles.composer}>
            <TextInput
              accessibilityLabel="Pregunta para Looper"
              editable={!agent.isBusy}
              multiline
              onChangeText={setDraft}
              onSubmitEditing={() => void submit()}
              placeholder={
                messages.length === 0 ? "Pregunta otra cosa…" : "Sigue preguntando…"
              }
              placeholderTextColor={colors.muted}
              style={styles.input}
              value={draft}
            />
            <SendButton
              busy={agent.isBusy}
              onPress={() => void (agent.isBusy ? agent.stop() : submit())}
              ready={draft.trim().length > 0}
            />
          </View>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function FollowUpSuggestions({ onSubmit }: { onSubmit: (suggestion: string) => void }) {
  return (
    <View style={styles.followUps}>
      <Text style={styles.followUpsLabel}>SIGUE EXPLORANDO</Text>
      {[
        "¿Quién propuso esa decisión?",
        "Enséñame el contexto anterior",
        "¿Qué quedó pendiente?",
      ].map((suggestion) => (
        <Pressable
          accessibilityLabel={suggestion}
          accessibilityRole="button"
          key={suggestion}
          onPress={() => onSubmit(suggestion)}
          style={({ pressed }) => [styles.followUp, pressed && styles.suggestionPressed]}
        >
          <Text style={styles.followUpText}>{suggestion}</Text>
          <Icon color={colors.accent} name="chevronRight" size={15} />
        </Pressable>
      ))}
    </View>
  );
}

function AskStarter({
  expanded,
  onSubmit,
  onToggle,
}: {
  expanded: boolean;
  onSubmit: (suggestion: string) => void;
  onToggle: () => void;
}) {
  return (
    <View style={styles.starter}>
      <Text style={styles.starterTitle}>Pregunta sobre tus notas y grabaciones.</Text>
      <Text style={styles.starterBody}>
        Las respuestas se sostienen en tus notas y grabaciones.
      </Text>
      <Pressable accessibilityRole="button" onPress={onToggle} style={styles.suggestionToggle}>
        <Text style={styles.suggestionToggleText}>{expanded ? "Ocultar ideas" : "Ver ideas"}</Text>
        <Icon color={colors.accent} name={expanded ? "chevronDown" : "chevronRight"} size={16} />
      </Pressable>
      {expanded
        ? SUGGESTIONS.map((suggestion) => (
            <Suggestion key={suggestion} onPress={() => onSubmit(suggestion)} text={suggestion} />
          ))
        : null}
    </View>
  );
}

function SendButton({
  busy,
  ready,
  onPress,
}: {
  busy: boolean;
  ready: boolean;
  onPress: () => void;
}) {
  const idle = !busy && !ready;
  return (
    <Pressable
      accessibilityLabel={busy ? "Detener respuesta" : "Enviar pregunta"}
      accessibilityRole="button"
      accessibilityState={{ disabled: idle }}
      disabled={idle}
      onPress={onPress}
      style={({ pressed }) => [
        styles.send,
        idle ? styles.sendIdle : styles.sendReady,
        !idle && pressed && styles.sendPressed,
      ]}
    >
      <Icon
        color={idle ? colors.disabled : colors.text}
        name={busy ? "stop" : "arrowUp"}
        size={19}
        strokeWidth={2.6}
      />
    </Pressable>
  );
}

function Suggestion({ text, onPress }: { text: string; onPress: () => void }) {
  return (
    <Pressable
      accessibilityLabel={text}
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [styles.suggestion, pressed && styles.suggestionPressed]}
    >
      <Text style={styles.suggestionText}>{text}</Text>
      <Icon color={colors.muted} name="chevronRight" size={16} strokeWidth={2.2} />
    </Pressable>
  );
}

function MessageRow({
  message,
  onOpenCitation,
  resolveCitation,
}: {
  message: ChatMessage;
  onOpenCitation: (citation: AgentCitation) => void;
  resolveCitation: (citation: AgentCitation) => Href | null;
}) {
  if (message.role === "user") {
    return (
      <View style={styles.userRow}>
        <Text style={styles.userBubble}>{message.content}</Text>
      </View>
    );
  }

  const streaming = message.status === "streaming" && !message.content;

  return (
    <View style={styles.answerRow}>
      <View style={styles.brandRow}>
        <Icon color={colors.accent} name="ask" size={13} strokeWidth={2.2} />
        <Text style={styles.brandLabel}>LOOPER</Text>
      </View>
      {streaming ? (
        <SearchingBubble count={message.sources?.length ?? 0} />
      ) : (
        <AnswerBody
          answer={message.content}
          onOpenCitation={onOpenCitation}
          resolveCitation={resolveCitation}
        />
      )}
    </View>
  );
}

function AnswerBody({
  answer,
  onOpenCitation,
  resolveCitation,
}: {
  answer: string;
  onOpenCitation: (citation: AgentCitation) => void;
  resolveCitation: (citation: AgentCitation) => Href | null;
}) {
  return (
    <View style={styles.answerBubble}>
      <View style={styles.answerParts}>
        {answerParts(answer).map((part, index) =>
          part.kind === "text" ? (
            <Text key={`${index}:${part.value}`} style={styles.answerText}>{part.value}</Text>
          ) : (
            <CitationChip
              citation={part.citation}
              key={`${index}:${part.citation.kind}:${part.citation.title}`}
              onPress={resolveCitation(part.citation) ? () => onOpenCitation(part.citation) : undefined}
            />
          ),
        )}
      </View>
    </View>
  );
}

function SearchingBubble({ count }: { count: number }) {
  return (
    <View style={styles.searching}>
      <View style={styles.dot} />
      <View style={[styles.dot, styles.dotHalf]} />
      <View style={[styles.dot, styles.dotFaint]} />
      <Text style={styles.searchingText}>
        {count > 0 ? `Buscando en ${count} documentos` : "Buscando en lo que capturaste"}
      </Text>
    </View>
  );
}

function CitationChip({
  citation,
  onPress,
}: {
  citation: AgentCitation;
  onPress?: () => void;
}) {
  const [title, at] = splitTimestamp(citation.title);
  const contents = (
    <>
      <Icon color={colors.accent} name={CITATION_ICON[citation.kind]} size={12} />
      <Text numberOfLines={1} style={styles.citationTitle}>
        {title}
      </Text>
      {at ? <Text style={styles.citationAt}>{at}</Text> : null}
    </>
  );
  if (!onPress) {
    return <View accessibilityLabel={`Fuente: ${title}`} style={styles.citationChip}>{contents}</View>;
  }
  return (
    <Pressable
      accessibilityLabel={`Abrir fuente ${title}`}
      accessibilityRole="button"
      onPress={onPress}
      style={styles.citationChip}
    >
      {contents}
    </Pressable>
  );
}

function citationTarget(
  citation: AgentCitation,
  notes: Note[],
  meetings: MeetingSession[],
): Href | null {
  const [title] = splitTimestamp(citation.title);
  if (citation.kind === "Meeting") {
    const meeting = meetings.find((candidate) => candidate.title === title);
    return meeting ? (`/meeting/${meeting.meetingId}` as Href) : null;
  }
  const note = notes.find(
    (candidate) =>
      candidate.title === title &&
      (citation.kind === "Note" || candidate.kind === "dictation"),
  );
  return note ? (`/notes?id=${encodeURIComponent(note.id)}` as Href) : null;
}

/** Una cita puede llegar con el minuto pegado al título: «Weekly sync 34:12». */
function splitTimestamp(title: string): [string, string | null] {
  const match = title.match(/^(.*?)\s+(\d{1,2}:\d{2}(?::\d{2})?)$/);
  return match?.[1] ? [match[1], match[2] ?? null] : [title, null];
}

/** Esqueleto con la forma del hilo: la pregunta a la derecha y la respuesta debajo. */
function ThreadSkeleton() {
  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={styles.skeleton}
    >
      <View style={styles.skeletonQuestion} />
      <View style={styles.skeletonLabel} />
      <View style={styles.skeletonAnswer} />
    </View>
  );
}

const COMPOSER_HEIGHT = 52;
const SEND_SIZE = 40;

const styles = StyleSheet.create({
  answerBubble: {
    backgroundColor: colors.surfaceMuted,
    borderColor: colors.border,
    borderRadius: radius.xl,
    borderBottomLeftRadius: radius.xs,
    borderWidth: 1,
    paddingHorizontal: space.lg,
    paddingVertical: 15,
  },
  answerRow: { alignSelf: "stretch", gap: 10 },
  answerParts: { alignItems: "baseline", flexDirection: "row", flexWrap: "wrap", gap: 4 },
  answerText: { ...typography.body, color: colors.text, lineHeight: 24 },
  brandLabel: { ...typography.label, color: colors.accent },
  brandRow: { alignItems: "center", flexDirection: "row", gap: 7 },
  composer: {
    alignItems: "flex-end",
    backgroundColor: colors.surface,
    borderRadius: radius.pill,
    flexDirection: "row",
    gap: 10,
    minHeight: COMPOSER_HEIGHT,
    paddingLeft: space.lg,
    paddingRight: 6,
    paddingVertical: 5,
  },
  composerSlot: { paddingBottom: 98, paddingHorizontal: space.lg, paddingTop: space.md },
  dot: { backgroundColor: colors.accent, borderRadius: radius.pill, height: 7, width: 7 },
  dotFaint: { opacity: 0.22 },
  dotHalf: { opacity: 0.5 },
  errorSlot: { paddingHorizontal: space.xl, paddingTop: space.md },
  followUp: {
    alignItems: "center",
    borderColor: colors.border,
    borderRadius: radius.lg,
    borderWidth: 1,
    flexDirection: "row",
    gap: space.sm,
    minHeight: 44,
    paddingHorizontal: space.md,
  },
  followUpText: { ...typography.meta, color: colors.textSecondary, flex: 1 },
  followUps: { gap: 7, paddingTop: space.sm },
  followUpsLabel: { ...typography.label, color: colors.muted, letterSpacing: 0.8, marginBottom: 2 },
  header: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
    paddingBottom: 10,
    paddingHorizontal: space.lg,
    paddingTop: space.md,
  },
  input: {
    ...typography.body,
    color: colors.text,
    flex: 1,
    maxHeight: 120,
    minHeight: SEND_SIZE,
    paddingTop: 10,
    paddingBottom: 10,
  },
  keyboard: { flex: 1 },
  reset: {
    alignItems: "center",
    height: hitTarget,
    justifyContent: "center",
    marginRight: -10,
    width: hitTarget,
  },
  safeArea: { backgroundColor: colors.background, flex: 1 },
  kicker: { ...typography.label, color: colors.accent, letterSpacing: 1.1, marginBottom: 3 },
  searching: {
    alignItems: "center",
    backgroundColor: colors.surfaceMuted,
    borderColor: colors.border,
    borderRadius: radius.xl,
    borderBottomLeftRadius: radius.xs,
    borderWidth: 1,
    flexDirection: "row",
    gap: 6,
    padding: space.lg,
  },
  searchingText: { ...typography.meta, color: colors.muted, marginLeft: space.sm },
  send: {
    alignItems: "center",
    borderRadius: radius.md,
    height: SEND_SIZE,
    justifyContent: "center",
    width: SEND_SIZE,
  },
  sendIdle: { ...relief.disabled, backgroundColor: colors.surface },
  sendPressed: relief.pressed,
  sendReady: relief.primary,
  skeleton: { gap: 10, paddingTop: space.xs },
  skeletonAnswer: {
    backgroundColor: colors.surfaceMuted,
    borderRadius: radius.xl,
    height: 104,
  },
  skeletonLabel: {
    backgroundColor: colors.surfaceMuted,
    borderRadius: radius.xs,
    height: 11,
    width: 72,
  },
  skeletonQuestion: {
    alignSelf: "flex-end",
    backgroundColor: colors.surface,
    borderRadius: radius.xl,
    height: 46,
    width: "62%",
  },
  citationChip: {
    alignItems: "center",
    backgroundColor: colors.accentSubtle,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.accent,
    flexDirection: "row",
    gap: 4,
    minHeight: 25,
    paddingHorizontal: 8,
  },
  citationAt: {
    ...typography.meta,
    color: colors.accent,
    fontVariant: ["tabular-nums"],
    fontWeight: "700",
  },
  citationTitle: { ...typography.meta, color: colors.accentDark, maxWidth: 150 },
  suggestion: {
    alignItems: "center",
    backgroundColor: colors.surfaceMuted,
    borderColor: colors.border,
    borderRadius: radius.lg,
    borderWidth: 1,
    flexDirection: "row",
    gap: space.md,
    minHeight: 58,
    paddingHorizontal: space.lg,
  },
  suggestionToggle: { alignItems: "center", flexDirection: "row", gap: space.xs },
  suggestionToggleText: { ...typography.meta, color: colors.accent, fontWeight: "700" },
  suggestionPressed: { backgroundColor: colors.surface },
  suggestionText: { ...typography.body, color: colors.textSecondary, flex: 1 },
  suggestions: { gap: 9 },
  starter: { gap: 8, paddingTop: 16 },
  starterBody: { ...typography.meta, color: colors.muted, lineHeight: 19, maxWidth: 280 },
  starterTitle: { ...typography.section, color: colors.text, lineHeight: 25, maxWidth: 310 },
  timeline: {
    flexGrow: 1,
    gap: space.md,
    paddingBottom: space.sm,
    paddingHorizontal: space.lg,
    paddingTop: space.xs,
  },
  title: { ...typography.title, color: colors.text },
  userBubble: {
    ...typography.body,
    backgroundColor: colors.accent,
    borderRadius: radius.xl,
    borderBottomRightRadius: radius.xs,
    color: colors.onAccent,
    maxWidth: "84%",
    overflow: "hidden",
    paddingHorizontal: space.lg,
    paddingVertical: space.md,
  },
  userRow: { alignItems: "flex-end" },
});
