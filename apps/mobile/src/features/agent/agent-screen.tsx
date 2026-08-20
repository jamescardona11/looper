import type { ChatMessage } from "@looper/data";
import { useRef, useState } from "react";
import {
  FlatList,
  KeyboardAvoidingView,
  type ListRenderItem,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Chip } from "@/shared/components/chip";
import { Icon, type IconName } from "@/shared/components/icon";
import { EmptyState, ErrorState } from "@/shared/components/screen-states";
import { SectionLabel } from "@/shared/components/section-label";
import { colors } from "@/shared/theme/colors";
import { hitTarget, radius, relief, space } from "@/shared/theme/layout";
import { typography } from "@/shared/theme/typography";
import { type AgentCitation, agentScopes, citationsFromAnswer } from "./agent-logic";
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

const renderMessage: ListRenderItem<ChatMessage> = ({ item }) => <MessageRow message={item} />;

export function AgentScreen({ meetingId }: { meetingId?: string }) {
  const agent = useMobileAgent(meetingId);
  const [draft, setDraft] = useState("");
  const [hiddenThrough, setHiddenThrough] = useState<string | null>(null);
  const listRef = useRef<FlatList<ChatMessage>>(null);

  // Una conversación nueva se pide sin borrar el hilo: se corta por el último
  // mensaje visto. Si ese mensaje ya no está, el corte se cae solo y vuelve todo.
  const cut = hiddenThrough ? agent.messages.findIndex((item) => item._id === hiddenThrough) : -1;
  const messages = agent.messages.slice(cut + 1);
  const lastQuestion = messages.reduce(
    (found, item) => (item.role === "user" ? item.content : found),
    "",
  );
  const scopeLocked = Boolean(meetingId);

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
          <Text accessibilityRole="header" style={styles.title}>
            Ask
          </Text>
          <Pressable
            accessibilityLabel="Nueva conversación"
            accessibilityRole="button"
            disabled={messages.length === 0}
            onPress={() => setHiddenThrough(agent.messages.at(-1)?._id ?? null)}
            style={styles.reset}
          >
            <Icon
              color={messages.length === 0 ? colors.disabled : colors.textSecondary}
              name="plus"
            />
          </Pressable>
        </View>

        <View accessibilityLabel="Ámbito de búsqueda" style={styles.scopes}>
          {agentScopes.map((item) => (
            <Chip
              key={item.id}
              label={item.label}
              onPress={scopeLocked ? undefined : () => agent.setScope(item.id)}
              selected={agent.scope === item.id}
            />
          ))}
        </View>

        <FlatList
          contentContainerStyle={styles.timeline}
          data={messages}
          keyboardShouldPersistTaps="handled"
          keyExtractor={(item) => item._id}
          ListEmptyComponent={
            agent.isLoading ? (
              <ThreadSkeleton />
            ) : (
              <EmptyState
                action={
                  <View style={styles.suggestions}>
                    {SUGGESTIONS.map((suggestion) => (
                      <Suggestion
                        key={suggestion}
                        onPress={() => void submit(suggestion)}
                        text={suggestion}
                      />
                    ))}
                  </View>
                }
                body="Nada de internet, nada inventado. Cada respuesta viene con la grabación o la nota de la que sale."
                title="Solo sabe lo que tú capturaste."
              />
            )
          }
          onContentSizeChange={() => listRef.current?.scrollToEnd({ animated: true })}
          ref={listRef}
          renderItem={renderMessage}
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
                messages.length === 0 ? "Pregunta sobre lo que capturaste" : "Sigue preguntando…"
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

function MessageRow({ message }: { message: ChatMessage }) {
  if (message.role === "user") {
    return (
      <View style={styles.userRow}>
        <Text style={styles.userBubble}>{message.content}</Text>
      </View>
    );
  }

  const streaming = message.status === "streaming" && !message.content;
  const citations = citationsFromAnswer(message.content);

  return (
    <View style={styles.answerRow}>
      <View style={styles.brandRow}>
        <Icon color={colors.accent} name="ask" size={13} strokeWidth={2.2} />
        <Text style={styles.brandLabel}>LOOPER</Text>
      </View>
      {streaming ? (
        <SearchingBubble count={message.sources?.length ?? 0} />
      ) : (
        <View style={styles.answerBubble}>
          <Text style={styles.answerText}>{message.content}</Text>
        </View>
      )}
      {citations.length > 0 ? (
        <View style={styles.sources}>
          <SectionLabel>Fuentes</SectionLabel>
          {citations.map((citation) => (
            <SourceRow citation={citation} key={`${citation.kind}:${citation.title}`} />
          ))}
        </View>
      ) : null}
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

function SourceRow({ citation }: { citation: AgentCitation }) {
  const [title, at] = splitTimestamp(citation.title);
  return (
    <View style={styles.source}>
      <Icon color={colors.muted} name={CITATION_ICON[citation.kind]} size={14} />
      <Text numberOfLines={1} style={styles.sourceTitle}>
        {title}
      </Text>
      {at ? <Text style={styles.sourceAt}>{at}</Text> : null}
    </View>
  );
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
  answerText: { ...typography.body, color: colors.text, lineHeight: 24 },
  brandLabel: { ...typography.label, color: colors.accent },
  brandRow: { alignItems: "center", flexDirection: "row", gap: 7 },
  composer: {
    alignItems: "flex-end",
    backgroundColor: colors.surfaceMuted,
    borderColor: colors.borderStrong,
    borderRadius: radius.xl,
    borderWidth: 1,
    flexDirection: "row",
    gap: 10,
    minHeight: COMPOSER_HEIGHT,
    paddingLeft: space.lg,
    paddingRight: 6,
    paddingVertical: 5,
  },
  composerSlot: { paddingBottom: 10, paddingHorizontal: space.lg, paddingTop: space.md },
  dot: { backgroundColor: colors.accent, borderRadius: radius.pill, height: 7, width: 7 },
  dotFaint: { opacity: 0.22 },
  dotHalf: { opacity: 0.5 },
  errorSlot: { paddingHorizontal: space.xl, paddingTop: space.md },
  header: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
    paddingBottom: space.md,
    paddingHorizontal: space.xl,
    paddingTop: space.xs,
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
  scopes: { flexDirection: "row", gap: 7, paddingBottom: 14, paddingHorizontal: space.xl },
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
  source: {
    alignItems: "center",
    borderColor: colors.border,
    borderRadius: radius.md,
    borderWidth: 1,
    flexDirection: "row",
    gap: 10,
    height: hitTarget,
    paddingHorizontal: space.md,
  },
  sourceAt: {
    ...typography.meta,
    color: colors.muted,
    fontVariant: ["tabular-nums"],
    fontWeight: "700",
  },
  sourceTitle: { ...typography.meta, color: colors.textSecondary, flex: 1 },
  sources: { gap: 6, paddingTop: 2 },
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
  suggestionPressed: { backgroundColor: colors.surface },
  suggestionText: { ...typography.body, color: colors.textSecondary, flex: 1 },
  suggestions: { gap: 9 },
  timeline: {
    flexGrow: 1,
    gap: space.xl,
    paddingBottom: space.sm,
    paddingHorizontal: space.xl,
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
