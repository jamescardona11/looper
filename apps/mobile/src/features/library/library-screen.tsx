import { useMeetingSessions, useNotes } from "@looper/data";
import { useTranslation } from "@looper/i18n/react";
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
  recentLibraryItems,
  searchLibraryItems,
} from "./library-logic";

type LibrarySection = { key: string; label: string; data: LibraryItem[] };
type Starter = { icon: IconName; title: string; note: string; href: Href };

const KIND_ICON: Record<LibraryItem["kind"], IconName> = {
  dictation: "dictado",
  meeting: "meeting",
  note: "nota",
};

const SKELETON_ROWS = ["a", "b", "c", "d", "e"];

export function LibraryScreen() {
  const { locale, t } = useTranslation();
  const router = useRouter();
  const notes = useNotes();
  const meetings = useMeetingSessions();
  const [searching, setSearching] = useState(false);
  const [query, setQuery] = useState("");
  const [rangeStart] = useState(() => Date.now() - 7 * 24 * 60 * 60 * 1_000);

  const items = useMemo(
    () => buildLibraryItems(notes.notes, meetings.sessions, "all", locale),
    [locale, meetings.sessions, notes.notes],
  );
  const rangedItems = useMemo(
    () => items.filter((item) => item.updatedAt >= rangeStart),
    [items, rangeStart],
  );
  const recentItems = useMemo(() => recentLibraryItems(items, rangeStart), [items, rangeStart]);
  const wordCount = useMemo(
    () => rangedItems.reduce((total, item) => total + wordCountFor(item.preview), 0),
    [rangedItems],
  );
  const needle = searching ? query.trim() : "";
  const sections = useMemo<LibrarySection[]>(() => {
    if (needle) {
      const hits = searchLibraryItems(items, needle);
      return [
        {
          key: "results",
          label: t("mobile.library.results", { count: hits.length, query: needle }),
          data: hits,
        },
      ];
    }
    return groupLibraryItemsByDay(recentItems, Date.now(), locale).map((group) => ({
      key: group.key,
      label: group.label,
      data: group.items,
    }));
  }, [items, locale, needle, recentItems, t]);

  const openItem = useCallback(
    (item: LibraryItem) => {
      router.push(
        (item.kind === "meeting" ? `/meeting/${item.id}` : `/notes?id=${item.id}`) as Href,
      );
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
          body={t("mobile.library.emptyBody")}
          title={t("mobile.library.emptyTitle")}
        />
      </View>
    );
  } else if (needle && sections.every((section) => section.data.length === 0)) {
    body = (
      <View style={styles.emptyArea}>
        <EmptyState
          action={<Button label={t("mobile.library.clearSearch")} onPress={() => setQuery("")} />}
          body={t("mobile.library.noResultsBody")}
          title={t("mobile.library.noResultsTitle", { query: needle })}
        />
      </View>
    );
  } else if (recentItems.length === 0) {
    body = (
      <View style={styles.emptyArea}>
        <EmptyState
          action={
            <Button
              label={t("mobile.library.viewAll")}
              onPress={() => router.push("/notes" as Href)}
              variant="secondary"
            />
          }
          body={t("mobile.library.noRecentBody")}
          title={t("mobile.library.noRecentTitle")}
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
        ListHeaderComponent={null}
        renderItem={renderItem}
        renderSectionHeader={
          needle
            ? ({ section }) => (
                <View style={styles.sectionHeader}>
                  <SectionLabel>{section.label}</SectionLabel>
                </View>
              )
            : undefined
        }
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
          hasLibraryItems={items.length > 0}
          onOpenLibrary={() => router.push("/notes" as Href)}
          onOpenSearch={() => setSearching(true)}
          wordCount={wordCount}
        />
      )}
      {body}
    </SafeAreaView>
  );
}

function BrowseHeader({
  hasLibraryItems,
  onOpenLibrary,
  onOpenSearch,
  wordCount,
}: {
  hasLibraryItems: boolean;
  onOpenLibrary: () => void;
  onOpenSearch: () => void;
  wordCount: number;
}) {
  const { locale, t } = useTranslation();

  return (
    <View style={styles.headerBlock}>
      <View style={styles.header}>
        <View>
          <Text style={styles.kicker}>{t("mobile.library.kicker")}</Text>
          <Text style={styles.title}>{t("mobile.library.greeting", { name: "James" })}</Text>
        </View>
        <HeaderIcon icon="search" label={t("mobile.library.search")} onPress={onOpenSearch} />
      </View>
      <View style={styles.signal}>
        <Text style={styles.signalEyebrow}>{t("mobile.library.thisWeek")}</Text>
        <View style={styles.signalMetric}>
          <Text style={styles.signalValue}>{formatNumber(wordCount, locale)}</Text>
          <Text style={styles.signalLabel}>{t("mobile.library.wordsCaptured")}</Text>
        </View>
        <Text style={styles.signalSummary}>{t("mobile.library.signalSummary")}</Text>
        {hasLibraryItems ? (
          <Pressable
            accessibilityLabel={t("mobile.library.viewAll")}
            accessibilityRole="button"
            onPress={onOpenLibrary}
            style={({ pressed }) => [styles.libraryLink, pressed && styles.sunk]}
          >
            <Text style={styles.libraryLinkText}>{t("mobile.library.viewAll")}</Text>
            <Icon color={colors.accent} name="chevronRight" size={15} strokeWidth={2.2} />
          </Pressable>
        ) : null}
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
  const { t } = useTranslation();

  return (
    <View style={styles.searchHeader}>
      <View style={styles.searchField}>
        <Icon color={colors.muted} name="search" size={17} />
        <TextInput
          accessibilityLabel={t("mobile.library.search")}
          autoCorrect={false}
          autoFocus
          onChangeText={onChange}
          placeholder={t("mobile.library.searchPlaceholder")}
          placeholderTextColor={colors.disabled}
          returnKeyType="search"
          style={styles.searchInput}
          value={query}
        />
        {query ? (
          <Pressable
            accessibilityLabel={t("mobile.library.clearSearch")}
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
        <Text style={styles.cancel}>{t("common.cancel")}</Text>
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
  const { locale, t } = useTranslation();
  const kindLabel = t(`mobile.library.kind.${item.kind}`);
  return (
    <Pressable
      accessibilityLabel={`${kindLabel}: ${item.title}`}
      accessibilityRole="button"
      onPress={() => onPress(item)}
      testID={`library-item-${item.kind}`}
      style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
    >
      <View style={styles.rowTile}>
        <Icon color={colors.accent} name={KIND_ICON[item.kind]} size={16} />
      </View>
      <View style={styles.rowCopy}>
        <Text numberOfLines={2} style={styles.rowTitle}>
          {item.title}
        </Text>
        <Text numberOfLines={1} style={styles.rowMeta}>
          {kindLabel} · {relativeTime(item.updatedAt, locale, t)}
        </Text>
      </View>
    </Pressable>
  );
}

function StarterList({ onSelect }: { onSelect: (href: Href) => void }) {
  const { t } = useTranslation();
  const starters: Starter[] = [
    {
      icon: "meeting",
      title: t("mobile.library.starterMeeting"),
      note: t("mobile.library.starterMeetingBody"),
      href: "/capture",
    },
    {
      icon: "dictado",
      title: t("mobile.library.starterDictation"),
      note: t("mobile.library.starterDictationBody"),
      href: "/dictation",
    },
    {
      icon: "nota",
      title: t("mobile.library.starterNote"),
      note: t("mobile.library.starterNoteBody"),
      href: "/notes",
    },
  ];

  return (
    <View style={styles.starters}>
      {starters.map((starter) => (
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

function relativeTime(
  timestamp: number,
  locale: "en" | "es",
  t: (id: string, values?: Record<string, unknown>) => string,
): string {
  const minutes = Math.max(0, Math.round((Date.now() - timestamp) / 60_000));
  if (minutes < 1) return t("common.justNow");
  if (minutes < 60) return t("common.minutesAgo", { min: minutes });
  const hours = Math.round(minutes / 60);
  if (hours < 24) return t("common.hoursAgo", { hr: hours });
  return new Intl.DateTimeFormat(locale, { day: "numeric", month: "short" }).format(timestamp);
}

function wordCountFor(value: string): number {
  return value.trim() ? value.trim().split(/\s+/).length : 0;
}

function formatNumber(value: number, locale: "en" | "es"): string {
  return new Intl.NumberFormat(locale).format(value);
}

const ROW_HEIGHT = 72;
const LIST_GUTTER = space.lg;

const styles = StyleSheet.create({
  cancel: { ...typography.body, color: colors.accent, fontWeight: "500" },
  emptyArea: { flex: 1, paddingBottom: 30, paddingHorizontal: space.xl },
  header: {
    alignItems: "center",
    flexDirection: "row",
    gap: space.sm,
    justifyContent: "space-between",
    paddingBottom: 10,
    paddingHorizontal: space.lg,
    paddingTop: space.md,
  },
  headerBlock: { gap: 0, paddingBottom: space.sm },
  headerIcon: {
    alignItems: "center",
    backgroundColor: colors.background,
    borderRadius: 15,
    height: hitTarget,
    justifyContent: "center",
    width: hitTarget,
  },
  headerIconPressed: { backgroundColor: colors.surfaceMuted, transform: [{ scale: 0.95 }] },
  kicker: { ...typography.label, color: colors.accent, letterSpacing: 1.2 },
  libraryLink: {
    alignItems: "center",
    alignSelf: "flex-start",
    flexDirection: "row",
    gap: space.xs,
    minHeight: hitTarget,
    marginTop: space.sm,
  },
  libraryLinkText: { ...typography.meta, color: colors.accent, fontWeight: "700" },
  list: { paddingBottom: 108, paddingHorizontal: LIST_GUTTER },
  row: {
    alignItems: "center",
    borderBottomColor: colors.border,
    borderBottomWidth: 1,
    borderRadius: 0,
    flexDirection: "row",
    gap: 11,
    minHeight: ROW_HEIGHT,
    paddingHorizontal: 2,
    paddingVertical: 11,
  },
  rowCopy: { flex: 1, gap: 3, minWidth: 0 },
  rowMeta: { ...typography.meta, color: colors.muted },
  rowPressed: { backgroundColor: colors.background, transform: [{ scale: 0.99 }] },
  rowTile: {
    alignItems: "center",
    backgroundColor: colors.background,
    borderRadius: 14,
    height: 40,
    justifyContent: "center",
    width: 40,
  },
  rowTitle: {
    ...typography.body,
    color: colors.text,
    fontSize: 14.5,
    fontWeight: "600",
    lineHeight: 19,
  },
  safeArea: { backgroundColor: colors.background, flex: 1 },
  signal: {
    backgroundColor: colors.accentLight,
    borderRadius: radius.xl,
    marginHorizontal: space.lg,
    padding: 20,
  },
  signalEyebrow: { ...typography.label, color: colors.textSecondary, letterSpacing: 1 },
  signalLabel: { ...typography.item, color: colors.text, fontSize: 15, lineHeight: 19 },
  signalMetric: {
    alignItems: "baseline",
    flexDirection: "row",
    gap: space.sm,
    marginTop: space.sm,
  },
  signalSummary: { ...typography.meta, color: colors.textSecondary, marginTop: 6 },
  signalValue: {
    ...typography.display,
    color: colors.text,
    fontSize: 38,
    lineHeight: 42,
  },
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
  title: { ...typography.title, color: colors.text, marginTop: 2 },
  weekBar: { backgroundColor: colors.accent, borderRadius: radius.pill, minHeight: 4, width: 8 },
  weekBarTrack: {
    alignItems: "center",
    backgroundColor: "rgba(72, 50, 158, 0.10)",
    borderRadius: radius.pill,
    height: 38,
    justifyContent: "flex-end",
    overflow: "hidden",
    width: 8,
  },
  weekBars: { alignItems: "flex-end", flexDirection: "row", gap: 7, height: 38, marginTop: 13 },
});
