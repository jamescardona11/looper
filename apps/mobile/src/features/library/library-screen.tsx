import { useMeetingSessions, useNotes } from "@looper/data";
import { type Href, useRouter } from "expo-router";
import { type ReactNode, useCallback, useMemo, useState } from "react";
import { Pressable, SectionList, StyleSheet, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Button } from "@/shared/components/button";
import { Icon, type IconName } from "@/shared/components/icon";
import { EmptyState, SkeletonRow } from "@/shared/components/screen-states";
import { SectionLabel } from "@/shared/components/section-label";
import { colors } from "@/shared/theme/colors";
import { hitTarget, radius, relief, space } from "@/shared/theme/layout";
import { typography } from "@/shared/theme/typography";
import {
  buildLibraryItems,
  groupLibraryItemsByDay,
  type LibraryItem,
  searchLibraryItems,
} from "./library-logic";

type LibrarySection = { key: string; label: string; data: LibraryItem[] };
type Starter = { icon: IconName; title: string; note: string; href: Href };

const KIND: Record<LibraryItem["kind"], { icon: IconName; label: string }> = {
  dictation: { icon: "dictado", label: "Dictado" },
  meeting: { icon: "meeting", label: "Meeting" },
  note: { icon: "nota", label: "Nota" },
};

/** El estado vacío ofrece las tres capturas, no un cartel: cada fila navega. */
const STARTERS: Starter[] = [
  {
    icon: "meeting",
    title: "Graba tu próximo meeting",
    note: "Se transcribe solo al terminar",
    href: "/capture",
  },
  {
    icon: "dictado",
    title: "Dicta una idea suelta",
    note: "Más rápido que escribirla",
    href: "/dictation",
  },
  { icon: "nota", title: "Escribe una nota", note: "Empieza en blanco", href: "/notes" },
];

const SKELETON_ROWS = ["a", "b", "c", "d", "e"];
const libraryDateFormatter = new Intl.DateTimeFormat("es", { day: "numeric", month: "short" });

export function LibraryScreen() {
  const router = useRouter();
  const notes = useNotes();
  const meetings = useMeetingSessions();
  const [searching, setSearching] = useState(false);
  const [query, setQuery] = useState("");

  const items = useMemo(
    () => buildLibraryItems(notes.notes, meetings.sessions, "all"),
    [meetings.sessions, notes.notes],
  );
  const needle = searching ? query.trim() : "";
  const sections = useMemo<LibrarySection[]>(() => {
    if (needle) {
      const hits = searchLibraryItems(items, needle);
      return [{ key: "results", label: resultsLabel(hits.length, needle), data: hits }];
    }
    return groupLibraryItemsByDay(items, Date.now()).map((group) => ({
      key: group.key,
      label: group.label,
      data: group.items,
    }));
  }, [items, needle]);

  const openItem = useCallback(
    (item: LibraryItem) => {
      router.push((item.kind === "meeting" ? `/meeting/${item.id}` : "/notes") as Href);
    },
    [router],
  );
  const renderItem = useCallback(
    ({ item }: { item: LibraryItem }) => <LibraryRow item={item} onPress={openItem} />,
    [openItem],
  );
  const closeSearch = useCallback(() => {
    setSearching(false);
    setQuery("");
  }, []);

  const isLoading = notes.isLoading || meetings.isLoading;
  let body: ReactNode;
  if (isLoading) {
    body = (
      <View style={styles.skeleton}>
        {SKELETON_ROWS.map((key) => (
          <SkeletonRow key={key} />
        ))}
      </View>
    );
  } else if (items.length === 0) {
    body = (
      <View style={styles.emptyArea}>
        <EmptyState
          action={<StarterList onSelect={(href) => router.push(href)} />}
          body="Empieza por donde te resulte natural. Todo lo que captures acaba aquí, buscable y citable."
          title="Todavía no hay nada que recordar."
        />
      </View>
    );
  } else if (sections.every((section) => section.data.length === 0)) {
    body = (
      <View style={styles.emptyArea}>
        <EmptyState
          action={<Button label="Borrar búsqueda" onPress={() => setQuery("")} />}
          body="La búsqueda mira el título y el contenido. Prueba con otra palabra."
          title={`Sin resultados para «${needle}».`}
        />
      </View>
    );
  } else {
    body = (
      <SectionList
        contentContainerStyle={styles.list}
        keyboardDismissMode="on-drag"
        keyboardShouldPersistTaps="handled"
        keyExtractor={(item) => `${item.kind}:${item.id}`}
        renderItem={renderItem}
        renderSectionHeader={({ section }) => (
          <View style={styles.sectionHeader}>
            <SectionLabel>{section.label}</SectionLabel>
          </View>
        )}
        sections={sections}
        stickySectionHeadersEnabled={false}
      />
    );
  }

  return (
    <SafeAreaView edges={["top"]} style={styles.safeArea}>
      {searching ? (
        <SearchHeader onCancel={closeSearch} onChange={setQuery} query={query} />
      ) : (
        <BrowseHeader
          onOpenSearch={() => setSearching(true)}
          onOpenStudio={() => router.push("/studio" as Href)}
        />
      )}
      {body}
    </SafeAreaView>
  );
}

function BrowseHeader({
  onOpenSearch,
  onOpenStudio,
}: {
  onOpenSearch: () => void;
  onOpenStudio: () => void;
}) {
  return (
    <View style={styles.header}>
      <Text style={styles.title}>Library</Text>
      <View style={styles.headerActions}>
        <HeaderIcon icon="search" label="Buscar en Library" onPress={onOpenSearch} />
        <HeaderIcon icon="studio" label="Abrir Studio" onPress={onOpenStudio} />
      </View>
    </View>
  );
}

function HeaderIcon({
  icon,
  label,
  onPress,
}: {
  icon: IconName;
  label: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityLabel={label}
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [styles.headerIcon, pressed && styles.headerIconPressed]}
    >
      <Icon color={colors.textSecondary} name={icon} size={20} />
    </Pressable>
  );
}

function SearchHeader({
  query,
  onChange,
  onCancel,
}: {
  query: string;
  onChange: (value: string) => void;
  onCancel: () => void;
}) {
  return (
    <View style={styles.searchHeader}>
      <View style={styles.searchField}>
        <Icon color={colors.muted} name="search" size={17} />
        <TextInput
          accessibilityLabel="Buscar en Library"
          autoCorrect={false}
          autoFocus
          onChangeText={onChange}
          placeholder="Meetings, dictados y notas"
          placeholderTextColor={colors.disabled}
          returnKeyType="search"
          style={styles.searchInput}
          value={query}
        />
        {query ? (
          <Pressable
            accessibilityLabel="Borrar búsqueda"
            accessibilityRole="button"
            hitSlop={10}
            onPress={() => onChange("")}
            style={styles.searchClear}
          >
            <Icon color={colors.textSecondary} name="close" size={11} strokeWidth={3} />
          </Pressable>
        ) : null}
      </View>
      <Pressable accessibilityRole="button" hitSlop={8} onPress={onCancel}>
        <Text style={styles.cancel}>Cancelar</Text>
      </Pressable>
    </View>
  );
}

/** Fila de 55: cuadro del tipo, título y meta. Sin chevron: el destino es obvio. */
function LibraryRow({
  item,
  onPress,
}: {
  item: LibraryItem;
  onPress: (item: LibraryItem) => void;
}) {
  const kind = KIND[item.kind];
  return (
    <Pressable
      accessibilityLabel={`${kind.label}: ${item.title}`}
      accessibilityRole="button"
      onPress={() => onPress(item)}
      style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
    >
      <View style={styles.rowTile}>
        <Icon color={colors.accent} name={kind.icon} size={16} />
      </View>
      <View style={styles.rowCopy}>
        <Text numberOfLines={1} style={styles.rowTitle}>
          {item.title}
        </Text>
        <Text numberOfLines={1} style={styles.rowMeta}>
          {kind.label} · {relativeTime(item.updatedAt)}
        </Text>
      </View>
    </Pressable>
  );
}

function StarterList({ onSelect }: { onSelect: (href: Href) => void }) {
  return (
    <View style={styles.starters}>
      {STARTERS.map((starter) => (
        <Pressable
          accessibilityLabel={starter.title}
          accessibilityRole="button"
          key={starter.title}
          onPress={() => onSelect(starter.href)}
          style={({ pressed }) => [styles.starter, pressed && styles.sunk]}
        >
          <View style={styles.starterTile}>
            <Icon color={colors.accent} name={starter.icon} size={19} />
          </View>
          <View style={styles.starterCopy}>
            <Text style={styles.starterTitle}>{starter.title}</Text>
            <Text style={styles.starterNote}>{starter.note}</Text>
          </View>
          <Icon color={colors.disabled} name="chevronRight" size={17} strokeWidth={2.2} />
        </Pressable>
      ))}
    </View>
  );
}

function resultsLabel(count: number, query: string): string {
  const noun = count === 1 ? "resultado" : "resultados";
  return `${count} ${noun} para «${query}»`;
}

function relativeTime(timestamp: number): string {
  const minutes = Math.max(0, Math.round((Date.now() - timestamp) / 60_000));
  if (minutes < 1) return "ahora";
  if (minutes < 60) return `hace ${minutes} min`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `hace ${hours} h`;
  return libraryDateFormatter.format(timestamp);
}

/** Alto de fila del artboard: cuadro de 34 con 10 de aire arriba y abajo. */
const ROW_HEIGHT = 55;
/** El cuerpo de la lista respira a 8 para que el fondo de pulsación desborde el texto. */
const LIST_GUTTER = space.sm;

const styles = StyleSheet.create({
  cancel: { ...typography.body, color: colors.accent, fontWeight: "500" },
  emptyArea: { flex: 1, paddingBottom: 30, paddingHorizontal: space.xl },
  header: {
    alignItems: "center",
    flexDirection: "row",
    gap: space.md,
    justifyContent: "space-between",
    paddingBottom: 10,
    paddingLeft: space.xl,
    paddingRight: 10,
    paddingTop: space.xs,
  },
  headerActions: { alignItems: "center", flexDirection: "row", gap: 2 },
  headerIcon: {
    alignItems: "center",
    borderRadius: radius.md,
    height: hitTarget,
    justifyContent: "center",
    width: hitTarget,
  },
  headerIconPressed: { backgroundColor: colors.surfaceMuted },
  list: { paddingBottom: space.xxl, paddingHorizontal: LIST_GUTTER },
  row: {
    alignItems: "center",
    borderRadius: radius.lg,
    flexDirection: "row",
    gap: 13,
    minHeight: ROW_HEIGHT,
    paddingHorizontal: space.md,
    paddingVertical: 10,
  },
  rowCopy: { flex: 1, gap: 3, minWidth: 0 },
  rowMeta: { ...typography.meta, color: colors.muted },
  rowPressed: { backgroundColor: colors.surfaceMuted },
  rowTile: {
    alignItems: "center",
    backgroundColor: colors.accentSubtle,
    borderRadius: radius.md,
    height: 34,
    justifyContent: "center",
    width: 34,
  },
  rowTitle: { ...typography.item, color: colors.text },
  safeArea: { backgroundColor: colors.background, flex: 1 },
  searchClear: {
    alignItems: "center",
    backgroundColor: colors.borderStrong,
    borderRadius: radius.pill,
    height: 20,
    justifyContent: "center",
    width: 20,
  },
  searchField: {
    alignItems: "center",
    backgroundColor: colors.surfaceMuted,
    borderColor: colors.borderStrong,
    borderRadius: radius.lg,
    borderWidth: 1,
    flex: 1,
    flexDirection: "row",
    gap: 10,
    height: 46,
    paddingHorizontal: 14,
  },
  searchHeader: {
    alignItems: "center",
    flexDirection: "row",
    gap: 10,
    paddingBottom: space.md,
    paddingHorizontal: space.xl,
    paddingTop: space.xs,
  },
  searchInput: { ...typography.body, color: colors.text, flex: 1, padding: 0 },
  sectionHeader: { paddingBottom: 5, paddingHorizontal: space.md, paddingTop: 13 },
  skeleton: { paddingHorizontal: LIST_GUTTER, paddingTop: space.md },
  starter: {
    ...relief.secondary,
    alignItems: "center",
    borderRadius: radius.lg,
    flexDirection: "row",
    gap: 14,
    minHeight: 72,
    paddingHorizontal: space.lg,
  },
  starterCopy: { flex: 1, gap: 3, minWidth: 0 },
  starterNote: { ...typography.meta, color: colors.muted },
  starterTile: {
    alignItems: "center",
    backgroundColor: colors.accentSubtle,
    borderRadius: radius.md,
    height: 38,
    justifyContent: "center",
    width: 38,
  },
  starterTitle: { ...typography.item, color: colors.text },
  starters: { gap: 9 },
  sunk: relief.pressed,
  title: { ...typography.title, color: colors.text },
});
