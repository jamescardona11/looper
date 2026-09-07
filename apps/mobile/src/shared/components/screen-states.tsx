import { useTranslation } from "@looper/i18n/react";
import type { ReactNode } from "react";
import { StyleSheet, Text, View } from "react-native";
import { colors } from "../theme/colors";
import { radius, space } from "../theme/layout";
import { typography } from "../theme/typography";
import { Button } from "./button";
import { Icon } from "./icon";

type EmptyStateProps = {
  title: string;
  body: string;
  action?: ReactNode;
};

type ErrorStateProps = {
  title: string;
  body: string;
  detail?: string;
  onRetry: () => void;
};

/** Dice qué falta y ofrece la acción; nunca un «no hay nada» a secas. */
export function EmptyState({ title, body, action }: EmptyStateProps) {
  return (
    <View style={styles.empty}>
      <View style={styles.emptyCopy}>
        <Text style={styles.emptyTitle}>{title}</Text>
        <Text style={styles.emptyBody}>{body}</Text>
      </View>
      {action}
    </View>
  );
}

/** Qué se ha salvado, por qué falló y una salida. El detalle técnico, aparte. */
export function ErrorState({ title, body, detail, onRetry }: ErrorStateProps) {
  const { t } = useTranslation();
  return (
    <View style={styles.errorPanel}>
      <View style={styles.errorHeading}>
        <Icon color={colors.danger} name="warning" size={18} />
        <Text style={styles.errorTitle}>{title}</Text>
      </View>
      <Text style={styles.errorBody}>{body}</Text>
      {detail ? <Text style={styles.errorDetail}>{detail}</Text> : null}
      <Button icon="refresh" label={t("common.retry")} onPress={onRetry} variant="secondary" />
    </View>
  );
}

/** Esqueleto con la forma de una fila de Library: cuadro de 34 y dos barras. */
export function SkeletonRow() {
  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={styles.row}
    >
      <View style={styles.rowBlock} />
      <View style={styles.rowBars}>
        <View style={styles.rowBarWide} />
        <View style={styles.rowBarNarrow} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  empty: { flex: 1, gap: 28, justifyContent: "center" },
  emptyBody: { ...typography.body, color: colors.muted },
  emptyCopy: { gap: 10 },
  emptyTitle: { ...typography.display, color: colors.text },
  errorBody: { ...typography.body, color: colors.textSecondary },
  errorDetail: {
    ...typography.meta,
    borderTopColor: colors.border,
    borderTopWidth: StyleSheet.hairlineWidth,
    color: colors.muted,
    paddingTop: space.md,
  },
  errorHeading: { alignItems: "center", flexDirection: "row", gap: space.sm },
  errorPanel: {
    backgroundColor: colors.surfaceMuted,
    borderColor: colors.danger,
    borderRadius: radius.xl,
    borderWidth: 1,
    gap: space.md,
    padding: space.xl,
  },
  errorTitle: { ...typography.section, color: colors.text, flex: 1 },
  row: {
    alignItems: "center",
    borderRadius: radius.lg,
    flexDirection: "row",
    gap: space.md,
    paddingHorizontal: space.md,
    paddingVertical: 10,
  },
  rowBarNarrow: {
    backgroundColor: colors.surfaceMuted,
    borderRadius: radius.xs,
    height: 10,
    width: "45%",
  },
  rowBarWide: {
    backgroundColor: colors.surface,
    borderRadius: radius.xs,
    height: 12,
    width: "72%",
  },
  rowBars: { flex: 1, gap: 6 },
  rowBlock: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    height: 34,
    width: 34,
  },
});
