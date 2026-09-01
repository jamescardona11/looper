import { type Href, router } from "expo-router";
import { Modal, Pressable, StyleSheet, Text, View } from "react-native";
import Animated, { FadeIn, FadeInDown } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { colors } from "../theme/colors";
import { radius, space } from "../theme/layout";
import { typography } from "../theme/typography";
import { Icon, type IconName } from "./icon";

type CaptureOption = { icon: IconName; title: string; note: string; href: Href };

const OPTIONS: CaptureOption[] = [
  {
    icon: "meeting",
    title: "Una reunión",
    note: "Transcribe, separa quién habla y prepara el resumen",
    href: "/capture",
  },
  {
    icon: "dictado",
    title: "Una nota de voz",
    note: "Para ti. Sin resumen, sin hablantes, más rápida",
    href: "/dictation",
  },
];

/** Radio propio de la hoja: más generoso que la escala, para que flote. */
const SHEET_RADIUS = 32;
const TILE = 44;
/** Escalonado de entrada. Corto: es una lista de tres, no una cortinilla. */
const STEP_MS = 45;

export function CaptureSheet({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const insets = useSafeAreaInsets();

  function go(href: Href) {
    onClose();
    router.push(href);
  }

  return (
    <Modal animationType="slide" onRequestClose={onClose} transparent visible={visible}>
      <View pointerEvents="box-none" style={styles.host}>
        <Pressable
          accessibilityLabel="Cerrar"
          accessibilityRole="button"
          onPress={onClose}
          style={styles.backdrop}
        />
        <View style={[styles.sheet, { paddingBottom: space.xl + insets.bottom }]}>
          <View style={styles.sheetHeader}>
            <View style={styles.grabber} />
            <Pressable
              accessibilityLabel="Cerrar captura"
              accessibilityRole="button"
              hitSlop={6}
              onPress={onClose}
              style={({ pressed }) => [styles.close, pressed && styles.closePressed]}
            >
              <Icon color={colors.textSecondary} name="close" size={18} strokeWidth={2.2} />
            </Pressable>
          </View>
          <Animated.Text entering={FadeIn.duration(160)} style={styles.heading}>
            ¿Qué vas a grabar?
          </Animated.Text>
          <Text style={styles.intro}>
            Elige el resultado que necesitas. Primero guardamos el audio en este iPhone.
          </Text>
          {OPTIONS.map((option, index) => (
            <Animated.View
              entering={FadeInDown.delay(index * STEP_MS).duration(220)}
              key={option.title}
            >
              <Pressable
                accessibilityRole="button"
                onPress={() => go(option.href)}
                style={({ pressed }) => [
                  styles.option,
                  index === 0 ? styles.meetingOption : styles.voiceOption,
                  pressed && styles.optionPressed,
                ]}
              >
                <View style={[styles.tile, index === 0 ? styles.meetingTile : styles.voiceTile]}>
                  <Icon
                    color={index === 0 ? colors.accent : colors.text}
                    name={option.icon}
                    size={20}
                  />
                </View>
                <View style={styles.copy}>
                  <Text style={[styles.title, index === 0 && styles.meetingText]}>
                    {option.title}
                  </Text>
                  <Text style={[styles.note, index === 0 && styles.meetingNote]}>
                    {option.note}
                  </Text>
                </View>
                <Text style={[styles.chevron, index === 0 && styles.meetingNote]}>›</Text>
              </Pressable>
            </Animated.View>
          ))}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    backgroundColor: colors.overlay,
    ...StyleSheet.absoluteFill,
  },
  close: {
    alignItems: "center",
    height: 44,
    justifyContent: "center",
    position: "absolute",
    right: -6,
    top: -14,
    width: 44,
  },
  closePressed: { opacity: 0.6 },
  copy: { flex: 1, gap: 1 },
  chevron: { ...typography.title, color: colors.muted },
  grabber: {
    alignSelf: "center",
    backgroundColor: colors.borderStrong,
    borderRadius: radius.pill,
    height: 4,
    width: 36,
  },
  heading: {
    ...typography.title,
    color: colors.text,
    paddingHorizontal: space.sm,
  },
  host: { flex: 1, justifyContent: "flex-end" },
  intro: {
    ...typography.meta,
    color: colors.muted,
    lineHeight: 19,
    maxWidth: 280,
    paddingHorizontal: space.sm,
  },
  note: { ...typography.meta, color: colors.muted },
  // Las filas no llevan tarjeta propia. Encajarlas en un contenedor con borde
  // apilaba tres grises casi iguales sobre negro y lo volvía barro; el fondo de
  // la hoja ya es el único escalón que hace falta.
  option: {
    alignItems: "center",
    borderRadius: 20,
    flexDirection: "row",
    gap: space.md,
    minHeight: 86,
    paddingHorizontal: space.md,
  },
  meetingNote: { color: colors.disabled },
  meetingOption: { backgroundColor: colors.pillShell },
  meetingText: { color: colors.onAccent },
  meetingTile: { backgroundColor: colors.accentSubtle },
  optionPressed: { opacity: 0.82 },
  sheet: {
    backgroundColor: colors.backgroundSecondary,
    borderTopLeftRadius: SHEET_RADIUS,
    borderTopRightRadius: SHEET_RADIUS,
    gap: 9,
    paddingHorizontal: space.lg,
    paddingTop: space.md,
  },
  sheetHeader: { alignItems: "center", height: 20, justifyContent: "center" },
  tile: {
    alignItems: "center",
    backgroundColor: colors.accentSubtle,
    borderRadius: TILE / 2,
    height: TILE,
    justifyContent: "center",
    width: TILE,
  },
  title: { ...typography.item, color: colors.text },
  voiceOption: { backgroundColor: colors.accentLight },
  voiceTile: { backgroundColor: "rgba(21, 22, 26, 0.08)" },
});
