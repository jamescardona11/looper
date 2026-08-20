import { type Href, router } from "expo-router";
import { Modal, Pressable, StyleSheet, Text, View } from "react-native";
import Animated, { FadeIn, FadeInDown } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { colors } from "../theme/colors";
import { captureBarZone, radius, space } from "../theme/layout";
import { typography } from "../theme/typography";
import { Icon, type IconName } from "./icon";

type CaptureOption = { icon: IconName; title: string; note: string; href: Href };

const OPTIONS: CaptureOption[] = [
  {
    icon: "meeting",
    title: "Meeting",
    note: "Graba y transcribe en el dispositivo",
    href: "/capture",
  },
  {
    icon: "dictado",
    title: "Dictar",
    note: "Una idea suelta, sin abrir el teclado",
    href: "/dictation",
  },
  { icon: "nota", title: "Nota", note: "Escribir en blanco", href: "/notes" },
];

/** Radio propio de la hoja: más generoso que la escala, para que flote. */
const SHEET_RADIUS = 28;
const TILE = 44;
/** Escalonado de entrada. Corto: es una lista de tres, no una cortinilla. */
const STEP_MS = 45;

export function CaptureSheet({
  visible,
  onClose,
}: {
  visible: boolean;
  onClose: () => void;
}) {
  const insets = useSafeAreaInsets();

  function go(href: Href) {
    onClose();
    router.push(href);
  }

  // En iOS un Modal es otra ventana: los toques no llegan a la app de debajo,
  // por mucho `pointerEvents` que se ponga. Así que el velo se detiene sobre la
  // píldora —para que el "+" ya girado a "×" se vea a plena luz— y esa franja
  // recibe su propia zona de cierre, encima.
  const barZone = captureBarZone + insets.bottom;

  return (
    <Modal animationType="slide" onRequestClose={onClose} transparent visible={visible}>
      <View pointerEvents="box-none" style={styles.host}>
        <Pressable
          accessibilityLabel="Cerrar"
          accessibilityRole="button"
          onPress={onClose}
          style={[styles.backdrop, { bottom: barZone }]}
        />
        <Pressable
          accessibilityLabel="Cerrar"
          accessibilityRole="button"
          onPress={onClose}
          style={[styles.barZone, { height: barZone }]}
        />
        <View style={[styles.sheet, { marginBottom: barZone }]}>
          <Animated.Text entering={FadeIn.duration(160)} style={styles.heading}>
            Capturar
          </Animated.Text>
          {OPTIONS.map((option, index) => (
            <Animated.View
              entering={FadeInDown.delay(index * STEP_MS).duration(220)}
              key={option.title}
            >
              <Pressable
                accessibilityRole="button"
                onPress={() => go(option.href)}
                style={({ pressed }) => [styles.option, pressed && styles.optionPressed]}
              >
                <View style={styles.tile}>
                  <Icon color={colors.accent} name={option.icon} size={20} />
                </View>
                <View style={styles.copy}>
                  <Text style={styles.title}>{option.title}</Text>
                  <Text style={styles.note}>{option.note}</Text>
                </View>
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
    left: 0,
    position: "absolute",
    right: 0,
    top: 0,
  },
  barZone: { bottom: 0, left: 0, position: "absolute", right: 0 },
  copy: { flex: 1, gap: 1 },
  heading: {
    ...typography.section,
    color: colors.text,
    paddingBottom: space.sm,
    paddingHorizontal: space.sm,
  },
  host: { flex: 1, justifyContent: "flex-end" },
  note: { ...typography.meta, color: colors.muted },
  // Las filas no llevan tarjeta propia. Encajarlas en un contenedor con borde
  // apilaba tres grises casi iguales sobre negro y lo volvía barro; el fondo de
  // la hoja ya es el único escalón que hace falta.
  option: {
    alignItems: "center",
    borderRadius: radius.lg,
    flexDirection: "row",
    gap: space.md,
    minHeight: 64,
    paddingHorizontal: space.sm,
  },
  optionPressed: { backgroundColor: colors.surfaceElevated },
  sheet: {
    backgroundColor: colors.surface,
    borderRadius: SHEET_RADIUS,
    gap: space.xs,
    marginHorizontal: space.md,
    padding: space.md,
  },
  tile: {
    alignItems: "center",
    backgroundColor: colors.accentSubtle,
    borderRadius: TILE / 2,
    height: TILE,
    justifyContent: "center",
    width: TILE,
  },
  title: { ...typography.item, color: colors.text },
});
