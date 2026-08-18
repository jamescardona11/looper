import type { AgentMemoryScope, ChatMessage } from "@looper/data";
import { useRef, useState } from "react";
import {
  ActivityIndicator,
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
import { colors } from "@/shared/theme/colors";
import { agentScopes, citationsFromAnswer } from "./agent-logic";
import { useMobileAgent } from "./use-mobile-agent";

const suggestions = [
  "¿Qué decisiones tomamos esta semana?",
  "Lista mis pendientes recientes",
  "Resume lo que capturé sobre onboarding",
];
const renderMessage: ListRenderItem<ChatMessage> = ({ item }) => <MessageRow message={item} />;

export function AgentScreen({ meetingId }: { meetingId?: string }) {
  const agent = useMobileAgent(meetingId);
  const [draft, setDraft] = useState("");
  const listRef = useRef<FlatList<ChatMessage>>(null);

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
          <Text style={styles.title}>Ask Looper</Text>
          <Text style={styles.subtitle}>
            {meetingId ? "Pregunta solo sobre este meeting." : "Respuestas privadas con fuentes de tu Library."}
          </Text>
        </View>
        <View accessibilityLabel="Ámbito de búsqueda" style={styles.scopes}>
          {agentScopes.map((item) => (
            <ScopeButton
              disabled={Boolean(meetingId)}
              key={item.id}
              label={item.label}
              onPress={() => agent.setScope(item.id)}
              selected={agent.scope === item.id}
              value={item.id}
            />
          ))}
        </View>
        <FlatList
          contentContainerStyle={styles.timeline}
          data={agent.messages}
          keyExtractor={(item) => item._id}
          ListEmptyComponent={
            agent.isLoading ? (
              <ActivityIndicator color={colors.accent} style={styles.loading} />
            ) : (
              <View style={styles.empty}>
                <Text style={styles.emptyTitle}>Tu memoria, con contexto.</Text>
                <Text style={styles.emptyBody}>
                  Elige un ámbito. Looper buscará únicamente ahí y citará lo que use.
                </Text>
                <View style={styles.suggestions}>
                  {suggestions.map((suggestion) => (
                    <Pressable
                      key={suggestion}
                      onPress={() => void submit(suggestion)}
                      style={styles.suggestion}
                    >
                      <Text style={styles.suggestionText}>{suggestion}</Text>
                    </Pressable>
                  ))}
                </View>
              </View>
            )
          }
          onContentSizeChange={() => listRef.current?.scrollToEnd({ animated: true })}
          ref={listRef}
          renderItem={renderMessage}
        />
        {agent.error ? <Text style={styles.error}>{agent.error}</Text> : null}
        <View style={styles.composer}>
          <TextInput
            accessibilityLabel="Pregunta para Looper"
            editable={!agent.isBusy}
            multiline
            onChangeText={setDraft}
            onSubmitEditing={() => void submit()}
            placeholder="Pregunta sobre lo que capturaste"
            placeholderTextColor={colors.muted}
            style={styles.input}
            value={draft}
          />
          {agent.isBusy ? (
            <Pressable accessibilityLabel="Detener respuesta" onPress={() => void agent.stop()} style={styles.send}>
              <Text style={styles.sendText}>■</Text>
            </Pressable>
          ) : (
            <Pressable accessibilityLabel="Enviar pregunta" onPress={() => void submit()} style={styles.send}>
              <Text style={styles.sendText}>↑</Text>
            </Pressable>
          )}
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function ScopeButton({
  value,
  label,
  selected,
  disabled,
  onPress,
}: {
  value: AgentMemoryScope;
  label: string;
  selected: boolean;
  disabled: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityLabel={`Buscar en ${label}`}
      accessibilityRole="tab"
      accessibilityState={{ disabled, selected }}
      disabled={disabled && value !== "meetings"}
      onPress={onPress}
      style={[styles.scope, selected && styles.scopeSelected]}
    >
      <Text style={[styles.scopeText, selected && styles.scopeTextSelected]}>{label}</Text>
    </Pressable>
  );
}

function MessageRow({ message }: { message: ChatMessage }) {
  const isUser = message.role === "user";
  const citations = isUser ? [] : citationsFromAnswer(message.content);
  return (
    <View style={[styles.messageWrap, isUser && styles.userWrap]}>
      {!isUser ? <Text style={styles.assistantLabel}>LOOPER</Text> : null}
      <View style={[styles.message, isUser ? styles.userMessage : styles.assistantMessage]}>
        {message.status === "streaming" && !message.content ? (
          <ActivityIndicator color={colors.accent} />
        ) : (
          <Text style={[styles.messageText, isUser && styles.userMessageText]}>{message.content}</Text>
        )}
      </View>
      {citations.length > 0 ? (
        <View style={styles.citations}>
          {citations.map((citation) => (
            <View key={`${citation.kind}:${citation.title}`} style={styles.citation}>
              <Text style={styles.citationKind}>{citation.kind}</Text>
              <Text numberOfLines={1} style={styles.citationTitle}>{citation.title}</Text>
            </View>
          ))}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  safeArea: { backgroundColor: colors.background, flex: 1 },
  keyboard: { flex: 1 },
  header: { gap: 4, paddingHorizontal: 18, paddingTop: 14 },
  title: { color: colors.text, fontSize: 27, fontWeight: "700", letterSpacing: -0.7 },
  subtitle: { color: colors.muted, fontSize: 13, lineHeight: 18 },
  scopes: { flexDirection: "row", gap: 7, paddingHorizontal: 18, paddingVertical: 14 },
  scope: { borderColor: colors.border, borderRadius: 10, borderWidth: 1, minHeight: 38, justifyContent: "center", paddingHorizontal: 11 },
  scopeSelected: { backgroundColor: colors.accentSubtle, borderColor: colors.accent },
  scopeText: { color: colors.muted, fontSize: 12, fontWeight: "700" },
  scopeTextSelected: { color: colors.accentLight },
  timeline: { flexGrow: 1, gap: 20, padding: 18, paddingTop: 8 },
  loading: { marginTop: 80 },
  empty: { gap: 12, marginTop: 34 },
  emptyTitle: { color: colors.text, fontSize: 22, fontWeight: "700" },
  emptyBody: { color: colors.textSecondary, lineHeight: 21 },
  suggestions: { gap: 8, marginTop: 8 },
  suggestion: { backgroundColor: colors.backgroundSecondary, borderColor: colors.border, borderRadius: 13, borderWidth: 1, padding: 14 },
  suggestionText: { color: colors.textSecondary, fontSize: 13, lineHeight: 18 },
  messageWrap: { alignSelf: "stretch", gap: 7 },
  userWrap: { alignItems: "flex-end" },
  assistantLabel: { color: colors.accentLight, fontSize: 10, fontWeight: "800", letterSpacing: 0.8 },
  message: { borderRadius: 15, maxWidth: "88%", paddingHorizontal: 14, paddingVertical: 11 },
  userMessage: { backgroundColor: colors.accent },
  assistantMessage: { backgroundColor: colors.backgroundSecondary, borderColor: colors.border, borderWidth: 1, maxWidth: "100%" },
  messageText: { color: colors.text, fontSize: 14, lineHeight: 21 },
  userMessageText: { color: colors.onAccent },
  citations: { gap: 6 },
  citation: { alignItems: "center", borderColor: colors.border, borderRadius: 10, borderWidth: 1, flexDirection: "row", gap: 8, minHeight: 38, paddingHorizontal: 10 },
  citationKind: { color: colors.accentLight, fontSize: 10, fontWeight: "800", textTransform: "uppercase" },
  citationTitle: { color: colors.textSecondary, flex: 1, fontSize: 12 },
  error: { color: colors.danger, fontSize: 12, paddingHorizontal: 18, paddingVertical: 6 },
  composer: { alignItems: "flex-end", backgroundColor: colors.background, borderTopColor: colors.border, borderTopWidth: StyleSheet.hairlineWidth, flexDirection: "row", gap: 9, padding: 12 },
  input: { backgroundColor: colors.backgroundSecondary, borderColor: colors.border, borderRadius: 15, borderWidth: 1, color: colors.text, flex: 1, fontSize: 14, maxHeight: 110, minHeight: 46, paddingHorizontal: 14, paddingVertical: 12 },
  send: { alignItems: "center", backgroundColor: colors.accent, borderRadius: 13, height: 46, justifyContent: "center", width: 46 },
  sendText: { color: colors.onAccent, fontSize: 21, fontWeight: "800" },
});
