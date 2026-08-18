import { useMeetingSessions, useNotes } from "@looper/data";
import { type Href, useRouter } from "expo-router";
import { useCallback, useMemo, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { colors } from "@/shared/theme/colors";
import { buildLibraryItems, type LibraryFilter, type LibraryItem } from "./library-logic";

const filters: Array<{ id: LibraryFilter; label: string }> = [
  { id: "all", label: "Todo" },
  { id: "notes", label: "Notas" },
  { id: "meetings", label: "Meetings" },
];
const libraryDateFormatter = new Intl.DateTimeFormat("es", { day: "numeric", month: "short" });

export function LibraryScreen() {
  const router = useRouter();
  const notes = useNotes();
  const meetings = useMeetingSessions();
  const [filter, setFilter] = useState<LibraryFilter>("all");
  const items = useMemo(
    () => buildLibraryItems(notes.notes, meetings.sessions, filter),
    [filter, meetings.sessions, notes.notes],
  );

  const openItem = useCallback(
    (item: LibraryItem) => {
      if (item.kind === "meeting") {
        router.push(`/meeting/${item.id}` as Href);
        return;
      }
      router.push("/notes");
    },
    [router],
  );
  const renderItem = useCallback(
    ({ item }: { item: LibraryItem }) => <LibraryRow item={item} onPress={openItem} />,
    [openItem],
  );

  return (
    <SafeAreaView style={styles.safeArea}>
      <FlatList
        contentContainerStyle={styles.content}
        data={items}
        keyExtractor={(item) => `${item.kind}:${item.id}`}
        ListHeaderComponent={
          <View style={styles.headerContent}>
            <View style={styles.titleRow}>
              <View style={styles.titleCopy}>
                <Text style={styles.title}>Library</Text>
                <Text style={styles.subtitle}>Notas, dictados y reuniones en un lugar.</Text>
              </View>
              <Pressable
                accessibilityLabel="Importar contenido"
                accessibilityRole="button"
                hitSlop={8}
                onPress={() => router.push("/import" as Href)}
                style={({ pressed }) => [styles.headerAction, pressed && styles.pressed]}
              >
                <Text style={styles.headerActionText}>Importar</Text>
              </Pressable>
            </View>
            <View accessibilityLabel="Filtrar Library" style={styles.filters}>
              {filters.map((option) => (
                <Pressable
                  accessibilityRole="tab"
                  accessibilityState={{ selected: filter === option.id }}
                  key={option.id}
                  onPress={() => setFilter(option.id)}
                  style={[styles.filter, filter === option.id && styles.filterSelected]}
                >
                  <Text
                    style={[styles.filterText, filter === option.id && styles.filterTextSelected]}
                  >
                    {option.label}
                  </Text>
                </Pressable>
              ))}
            </View>
            <Text style={styles.sectionLabel}>RECIENTE</Text>
            {notes.isLoading || meetings.isLoading ? (
              <ActivityIndicator color={colors.accent} style={styles.loading} />
            ) : null}
          </View>
        }
        ListEmptyComponent={
          notes.isLoading || meetings.isLoading ? null : (
            <View style={styles.empty}>
              <Text style={styles.emptyTitle}>Tu Library está lista.</Text>
              <Text style={styles.emptyBody}>
                Crea una nota, dicta una idea o empieza un meeting.
              </Text>
            </View>
          )
        }
        ListFooterComponent={<View style={styles.footerSpace} />}
        renderItem={renderItem}
      />
      <View style={styles.quickActions}>
        <Pressable
          accessibilityLabel="Crear una nota"
          accessibilityRole="button"
          onPress={() => router.push("/notes" as Href)}
          style={({ pressed }) => [styles.secondaryQuickButton, pressed && styles.pressed]}
        >
          <Text style={styles.secondaryQuickButtonText}>Nota</Text>
        </Pressable>
        <Pressable
          accessibilityLabel="Dictar una idea"
          accessibilityRole="button"
          onPress={() => router.push("/dictation" as Href)}
          style={({ pressed }) => [styles.secondaryQuickButton, pressed && styles.pressed]}
        >
          <Text style={styles.secondaryQuickButtonText}>Dictar</Text>
        </Pressable>
        <Pressable
          accessibilityLabel="Empezar meeting"
          accessibilityRole="button"
          onPress={() => router.push("/capture" as Href)}
          style={({ pressed }) => [styles.startButton, pressed && styles.primaryPressed]}
        >
          <Text style={styles.startButtonText}>Empezar meeting</Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

function LibraryRow({
  item,
  onPress,
}: {
  item: LibraryItem;
  onPress: (item: LibraryItem) => void;
}) {
  const label =
    item.kind === "meeting" ? "Meeting" : item.kind === "dictation" ? "Dictado" : "Nota";
  return (
    <Pressable
      accessibilityLabel={`${label}: ${item.title}`}
      accessibilityRole="button"
      onPress={() => onPress(item)}
      style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
    >
      <View style={styles.rowMark}>
        <Text style={styles.rowMarkText}>{label.at(0)}</Text>
      </View>
      <View style={styles.rowCopy}>
        <Text numberOfLines={1} style={styles.rowTitle}>
          {item.title}
        </Text>
        <Text style={styles.rowMeta}>
          {label} · {relativeTime(item.updatedAt)}
        </Text>
        <Text numberOfLines={1} style={styles.rowPreview}>
          {item.preview}
        </Text>
      </View>
      <Text style={styles.chevron}>›</Text>
    </Pressable>
  );
}

function relativeTime(timestamp: number): string {
  const minutes = Math.max(0, Math.round((Date.now() - timestamp) / 60_000));
  if (minutes < 1) return "ahora";
  if (minutes < 60) return `hace ${minutes} min`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `hace ${hours} h`;
  return libraryDateFormatter.format(timestamp);
}

const styles = StyleSheet.create({
  safeArea: { backgroundColor: colors.background, flex: 1 },
  content: { paddingHorizontal: 18 },
  headerContent: { gap: 18, paddingTop: 14 },
  titleRow: { alignItems: "center", flexDirection: "row", gap: 12 },
  titleCopy: { flex: 1, gap: 4 },
  title: { color: colors.text, fontSize: 28, fontWeight: "700", letterSpacing: -0.8 },
  subtitle: { color: colors.muted, fontSize: 13, lineHeight: 18 },
  headerAction: {
    alignItems: "center",
    borderColor: colors.border,
    borderCurve: "continuous",
    borderRadius: 12,
    borderWidth: 1,
    minHeight: 44,
    justifyContent: "center",
    paddingHorizontal: 12,
  },
  headerActionText: { color: colors.textSecondary, fontSize: 13, fontWeight: "700" },
  pressed: { backgroundColor: colors.surfaceMuted },
  filters: {
    backgroundColor: colors.backgroundSecondary,
    borderColor: colors.border,
    borderCurve: "continuous",
    borderRadius: 14,
    borderWidth: 1,
    flexDirection: "row",
    gap: 4,
    padding: 4,
  },
  filter: {
    alignItems: "center",
    borderRadius: 10,
    flex: 1,
    minHeight: 40,
    justifyContent: "center",
  },
  filterSelected: { backgroundColor: colors.surface },
  filterText: { color: colors.muted, fontSize: 13, fontWeight: "600" },
  filterTextSelected: { color: colors.text },
  sectionLabel: { color: colors.muted, fontSize: 11, fontWeight: "800", letterSpacing: 0.8 },
  loading: { paddingVertical: 10 },
  error: { color: colors.danger, lineHeight: 20 },
  row: {
    alignItems: "center",
    borderBottomColor: colors.border,
    borderBottomWidth: StyleSheet.hairlineWidth,
    flexDirection: "row",
    gap: 12,
    minHeight: 86,
    paddingVertical: 12,
  },
  rowPressed: { backgroundColor: colors.surfaceMuted },
  rowMark: {
    alignItems: "center",
    backgroundColor: colors.accentSubtle,
    borderCurve: "continuous",
    borderRadius: 12,
    height: 42,
    justifyContent: "center",
    width: 42,
  },
  rowMarkText: { color: colors.accentLight, fontSize: 15, fontWeight: "800" },
  rowCopy: { flex: 1, gap: 3, minWidth: 0 },
  rowTitle: { color: colors.text, fontSize: 15, fontWeight: "700" },
  rowMeta: { color: colors.muted, fontSize: 12 },
  rowPreview: { color: colors.textSecondary, fontSize: 13 },
  chevron: { color: colors.disabled, fontSize: 24 },
  empty: {
    alignItems: "center",
    backgroundColor: colors.backgroundSecondary,
    borderCurve: "continuous",
    borderRadius: 16,
    gap: 7,
    padding: 28,
  },
  emptyTitle: { color: colors.text, fontSize: 17, fontWeight: "700" },
  emptyBody: { color: colors.muted, lineHeight: 20, textAlign: "center" },
  footerSpace: { height: 110 },
  quickActions: {
    bottom: 14,
    flexDirection: "row",
    gap: 10,
    left: 18,
    position: "absolute",
    right: 18,
  },
  secondaryQuickButton: {
    alignItems: "center",
    backgroundColor: colors.backgroundSecondary,
    borderColor: colors.borderStrong,
    borderCurve: "continuous",
    borderRadius: 14,
    borderWidth: 1,
    justifyContent: "center",
    minHeight: 50,
    paddingHorizontal: 14,
  },
  secondaryQuickButtonText: { color: colors.text, fontSize: 15, fontWeight: "800" },
  startButton: {
    alignItems: "center",
    backgroundColor: colors.accent,
    borderCurve: "continuous",
    borderRadius: 14,
    flex: 1,
    minHeight: 50,
    justifyContent: "center",
  },
  primaryPressed: { backgroundColor: colors.accentDark },
  startButtonText: { color: colors.onAccent, fontSize: 15, fontWeight: "800" },
});
