import { useDictationSettings } from "@looper/data";
import { type Href, useFocusEffect, useRouter } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { colors } from "@/shared/theme/colors";
import {
  createSmartMode,
  type MobileStudioSettings,
  normalizeStudioSettings,
  type SmartMode,
  studioSettingsData,
  type WritingStyle,
} from "@/shared/studio/studio-settings";

type StudioTab = "styles" | "modes";

export function StudioScreen() {
  const router = useRouter();
  const remote = useDictationSettings();
  const [settings, setSettings] = useState(() => normalizeStudioSettings(remote.doc?.data));
  const [tab, setTab] = useState<StudioTab>("styles");
  const [editor, setEditor] = useState<"style" | "mode" | null>(null);
  const [status, setStatus] = useState<string | null>(null);

  useEffect(() => {
    if (!remote.isLoading) setSettings(normalizeStudioSettings(remote.doc?.data));
  }, [remote.doc?.data, remote.isLoading]);

  useFocusEffect(
    useCallback(
      () => () => {
        setEditor(null);
      },
      [],
    ),
  );

  const persist = async (next: MobileStudioSettings) => {
    setSettings(next);
    setStatus("Guardando…");
    try {
      await remote.update(studioSettingsData(next));
      setStatus("Guardado. El teclado se actualiza automáticamente.");
    } catch {
      setStatus("No se pudo guardar Studio.");
    }
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.header}>
        <Text style={styles.title}>Studio</Text>
        <Pressable
          accessibilityLabel="Configuración del teclado"
          onPress={() => router.push("/keyboard" as Href)}
          style={styles.keyboardButton}
        >
          <Text style={styles.keyboardButtonText}>Teclado</Text>
        </Pressable>
      </View>
      <View accessibilityLabel="Secciones de Studio" style={styles.tabs}>
        <StudioTabButton
          active={tab === "styles"}
          label="Estilos"
          onPress={() => setTab("styles")}
        />
        <StudioTabButton
          active={tab === "modes"}
          label="Smart Modes"
          onPress={() => setTab("modes")}
        />
      </View>
      <ScrollView contentContainerStyle={styles.content}>
        {tab === "styles" ? (
          <StylesSection
            settings={settings}
            select={(activeStyleId) => void persist({ ...settings, activeStyleId })}
          />
        ) : (
          <ModesSection
            modes={settings.smartModes}
            styles={settings.styles}
            toggle={(id) =>
              void persist({
                ...settings,
                smartModes: settings.smartModes.map((mode) =>
                  mode.id === id ? { ...mode, enabled: !mode.enabled } : mode,
                ),
              })
            }
          />
        )}
        {status ? (
          <Text accessibilityLiveRegion="polite" style={styles.status}>
            {status}
          </Text>
        ) : null}
        <View style={styles.runtimeCard}>
          <Text style={styles.runtimeTitle}>Cómo se aplica</Text>
          <Text style={styles.runtimeBody}>
            iPhone: elige el estilo o Smart Mode en el teclado. Android puede además usar una regla
            por app cuando tenga un package id configurado.
          </Text>
          <Text style={styles.runtimeBody}>
            El teclado no inventa contenido: tono y formato transforman únicamente el dictado.
          </Text>
        </View>
      </ScrollView>
      <Pressable
        accessibilityLabel={tab === "styles" ? "Crear estilo" : "Crear Smart Mode"}
        onPress={() => setEditor(tab === "styles" ? "style" : "mode")}
        style={styles.fab}
      >
        <Text style={styles.fabText}>＋</Text>
      </Pressable>
      <StudioEditor
        kind={editor}
        onClose={() => setEditor(null)}
        onMode={(mode) => {
          setEditor(null);
          void persist({ ...settings, smartModes: [...settings.smartModes, mode] });
        }}
        onStyle={(style) => {
          setEditor(null);
          void persist({
            ...settings,
            styles: [...settings.styles, style],
            activeStyleId: style.id,
          });
        }}
        styles={settings.styles}
      />
    </SafeAreaView>
  );
}

function StudioTabButton({
  active,
  label,
  onPress,
}: {
  active: boolean;
  label: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="tab"
      accessibilityState={{ selected: active }}
      onPress={onPress}
      style={[styles.tab, active && styles.activeTab]}
    >
      <Text style={[styles.tabText, active && styles.activeTabText]}>{label}</Text>
    </Pressable>
  );
}

function StylesSection({
  settings,
  select,
}: {
  settings: MobileStudioSettings;
  select: (id: string) => void;
}) {
  const active =
    settings.styles.find((style) => style.id === settings.activeStyleId) ?? settings.styles[0];
  return (
    <View style={styles.section}>
      <Text style={styles.intro}>
        Define cómo suena tu voz después del dictado. El contenido no cambia; sí cambia su forma.
      </Text>
      {settings.styles.map((style) => {
        const selected = style.id === settings.activeStyleId;
        return (
          <Pressable
            accessibilityRole="radio"
            accessibilityState={{ selected }}
            key={style.id}
            onPress={() => select(style.id)}
            style={[styles.card, styles.styleRow, selected && styles.selectedCard]}
          >
            <View style={styles.styleMark}>
              <Text style={styles.styleMarkText}>{style.name.at(0)}</Text>
            </View>
            <View style={styles.cardCopy}>
              <Text style={styles.cardTitle}>{style.name}</Text>
              <Text style={styles.cardMeta}>{style.description}</Text>
            </View>
            <View style={[styles.radio, selected && styles.radioSelected]} />
          </Pressable>
        );
      })}
      {active ? (
        <View style={styles.preview}>
          <Text style={styles.previewLabel}>VISTA PREVIA · {active.name}</Text>
          <Text style={styles.previewInput}>
            “Pues te quería decir que creo que hoy sí te puedo mandar la propuesta…”
          </Text>
          <Text style={styles.previewOutput}>{active.example}</Text>
        </View>
      ) : null}
    </View>
  );
}

function ModesSection({
  modes,
  styles,
  toggle,
}: {
  modes: SmartMode[];
  styles: WritingStyle[];
  toggle: (id: string) => void;
}) {
  return (
    <View style={stylesSheet.section}>
      <Text style={stylesSheet.intro}>
        Un Smart Mode combina contexto, estilo y formato. En iPhone siempre puedes cambiarlo antes
        de dictar.
      </Text>
      {modes.length === 0 ? (
        <View style={stylesSheet.empty}>
          <Text style={stylesSheet.emptyTitle}>Aún no hay Smart Modes</Text>
          <Text style={stylesSheet.cardMeta}>
            Crea uno para email, mensajes, notas o seguimiento de reuniones.
          </Text>
        </View>
      ) : (
        modes.map((mode) => (
          <View key={mode.id} style={[stylesSheet.card, stylesSheet.modeCard]}>
            <View style={stylesSheet.modeHead}>
              <View style={stylesSheet.cardCopy}>
                <Text style={stylesSheet.cardTitle}>{mode.name}</Text>
                <Text style={stylesSheet.cardMeta}>
                  {mode.triggerType === "manual"
                    ? "Selección manual en el teclado"
                    : `Android · ${mode.triggerValue}`}
                </Text>
              </View>
              <Switch
                onValueChange={() => toggle(mode.id)}
                trackColor={{ false: colors.borderStrong, true: colors.accent }}
                value={mode.enabled}
              />
            </View>
            <View style={stylesSheet.flow}>
              <Text style={stylesSheet.flowKey}>CUANDO</Text>
              <Text style={stylesSheet.flowValue}>
                {mode.triggerType === "manual" ? "Lo selecciono" : "Abro la app"}
              </Text>
              <Text style={stylesSheet.flowKey}>ENTONCES</Text>
              <Text style={stylesSheet.flowValue}>
                {styles.find((style) => style.id === mode.styleId)?.name ?? "Estilo"} ·{" "}
                {mode.format}
              </Text>
            </View>
          </View>
        ))
      )}
    </View>
  );
}

function StudioEditor({
  kind,
  styles: availableStyles,
  onClose,
  onStyle,
  onMode,
}: {
  kind: "style" | "mode" | null;
  styles: WritingStyle[];
  onClose: () => void;
  onStyle: (style: WritingStyle) => void;
  onMode: (mode: SmartMode) => void;
}) {
  const [name, setName] = useState("");
  const [instructions, setInstructions] = useState("");
  const [styleId, setStyleId] = useState(availableStyles[0]?.id ?? "concise");
  const [format, setFormat] = useState<SmartMode["format"]>("none");
  const save = () => {
    if (!name.trim()) return;
    if (kind === "style") {
      onStyle({
        id: `style_${Date.now()}`,
        name: name.trim(),
        description: "Personalizado",
        promptTemplate: instructions.trim(),
        example: "Vista previa disponible al usar este estilo.",
      });
    } else if (kind === "mode") {
      onMode(createSmartMode({ name, styleId, format, instructions }));
    }
    setName("");
    setInstructions("");
  };
  return (
    <Modal animationType="slide" onRequestClose={onClose} transparent visible={kind !== null}>
      <View style={stylesSheet.modalBackdrop}>
        <View style={stylesSheet.sheet}>
          <View style={stylesSheet.sheetHead}>
            <Text style={stylesSheet.sheetTitle}>
              {kind === "style" ? "Nuevo estilo" : "Nuevo Smart Mode"}
            </Text>
            <Pressable onPress={onClose} style={stylesSheet.close}>
              <Text style={stylesSheet.closeText}>×</Text>
            </Pressable>
          </View>
          <TextInput
            onChangeText={setName}
            placeholder="Nombre"
            placeholderTextColor={colors.muted}
            style={stylesSheet.input}
            value={name}
          />
          {kind === "mode" ? (
            <>
              <Text style={stylesSheet.fieldLabel}>ESTILO</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                {availableStyles.map((style) => (
                  <Pressable
                    key={style.id}
                    onPress={() => setStyleId(style.id)}
                    style={[stylesSheet.option, styleId === style.id && stylesSheet.optionSelected]}
                  >
                    <Text style={stylesSheet.optionText}>{style.name}</Text>
                  </Pressable>
                ))}
              </ScrollView>
              <Text style={stylesSheet.fieldLabel}>FORMATO</Text>
              <View style={stylesSheet.options}>
                {(["none", "email", "message", "bullets", "todo"] as const).map((value) => (
                  <Pressable
                    key={value}
                    onPress={() => setFormat(value)}
                    style={[stylesSheet.option, format === value && stylesSheet.optionSelected]}
                  >
                    <Text style={stylesSheet.optionText}>{value}</Text>
                  </Pressable>
                ))}
              </View>
            </>
          ) : null}
          <TextInput
            multiline
            onChangeText={setInstructions}
            placeholder="Instrucciones"
            placeholderTextColor={colors.muted}
            style={[stylesSheet.input, stylesSheet.instructions]}
            textAlignVertical="top"
            value={instructions}
          />
          <Pressable onPress={save} style={stylesSheet.save}>
            <Text style={stylesSheet.saveText}>Guardar</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const stylesSheet = StyleSheet.create({
  safeArea: { backgroundColor: colors.background, flex: 1 },
  header: { alignItems: "center", flexDirection: "row", paddingHorizontal: 18, paddingTop: 14 },
  title: { color: colors.text, flex: 1, fontSize: 27, fontWeight: "700" },
  keyboardButton: {
    borderColor: colors.border,
    borderRadius: 10,
    borderWidth: 1,
    minHeight: 40,
    justifyContent: "center",
    paddingHorizontal: 12,
  },
  keyboardButtonText: { color: colors.textSecondary, fontSize: 12, fontWeight: "700" },
  tabs: {
    borderBottomColor: colors.border,
    borderBottomWidth: 1,
    flexDirection: "row",
    gap: 18,
    paddingHorizontal: 18,
  },
  tab: { minHeight: 48, justifyContent: "center" },
  activeTab: { borderBottomColor: colors.accent, borderBottomWidth: 2 },
  tabText: { color: colors.muted, fontSize: 14, fontWeight: "700" },
  activeTabText: { color: colors.text },
  content: { padding: 18, paddingBottom: 110 },
  section: { gap: 10 },
  intro: { color: colors.textSecondary, fontSize: 13, lineHeight: 20, marginBottom: 8 },
  card: {
    backgroundColor: colors.backgroundSecondary,
    borderColor: colors.border,
    borderRadius: 15,
    borderWidth: 1,
    padding: 14,
  },
  styleRow: { alignItems: "center", flexDirection: "row", gap: 12 },
  selectedCard: { borderColor: colors.accent },
  styleMark: {
    alignItems: "center",
    backgroundColor: colors.surface,
    borderRadius: 11,
    height: 40,
    justifyContent: "center",
    width: 40,
  },
  styleMarkText: { color: colors.accentLight, fontWeight: "800" },
  cardCopy: { flex: 1, gap: 4 },
  cardTitle: { color: colors.text, fontSize: 14, fontWeight: "700" },
  cardMeta: { color: colors.muted, fontSize: 12, lineHeight: 17 },
  radio: {
    borderColor: colors.borderStrong,
    borderRadius: 99,
    borderWidth: 1,
    height: 18,
    width: 18,
  },
  radioSelected: { backgroundColor: colors.accent, borderColor: colors.accent, borderWidth: 4 },
  preview: { gap: 8, marginTop: 12 },
  previewLabel: { color: colors.muted, fontSize: 10, fontWeight: "800", letterSpacing: 0.7 },
  previewInput: {
    backgroundColor: colors.surfaceMuted,
    borderRadius: 12,
    color: colors.textSecondary,
    fontSize: 13,
    lineHeight: 19,
    padding: 13,
  },
  previewOutput: {
    backgroundColor: colors.accentSubtle,
    borderColor: colors.accent,
    borderRadius: 12,
    borderWidth: 1,
    color: colors.text,
    fontSize: 13,
    lineHeight: 20,
    padding: 13,
  },
  modeCard: { gap: 13 },
  modeHead: { alignItems: "center", flexDirection: "row", gap: 10 },
  flow: { flexDirection: "row", flexWrap: "wrap", gap: 7 },
  flowKey: { color: colors.muted, fontSize: 10, fontWeight: "800", width: 62 },
  flowValue: { color: colors.textSecondary, flexBasis: "70%", fontSize: 12 },
  empty: { backgroundColor: colors.backgroundSecondary, borderRadius: 15, gap: 7, padding: 24 },
  emptyTitle: { color: colors.text, fontSize: 17, fontWeight: "700" },
  status: { color: colors.muted, fontSize: 12, lineHeight: 18, marginTop: 14 },
  runtimeCard: {
    borderTopColor: colors.border,
    borderTopWidth: 1,
    gap: 8,
    marginTop: 24,
    paddingTop: 18,
  },
  runtimeTitle: { color: colors.text, fontSize: 14, fontWeight: "700" },
  runtimeBody: { color: colors.muted, fontSize: 12, lineHeight: 18 },
  fab: {
    alignItems: "center",
    backgroundColor: colors.accent,
    borderRadius: 15,
    bottom: 18,
    height: 50,
    justifyContent: "center",
    position: "absolute",
    right: 18,
    width: 50,
  },
  fabText: { color: colors.onAccent, fontSize: 25 },
  modalBackdrop: { backgroundColor: colors.overlay, flex: 1, justifyContent: "flex-end" },
  sheet: {
    backgroundColor: colors.backgroundSecondary,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    gap: 14,
    padding: 20,
    paddingBottom: 34,
  },
  sheetHead: { alignItems: "center", flexDirection: "row" },
  sheetTitle: { color: colors.text, flex: 1, fontSize: 21, fontWeight: "700" },
  close: {
    alignItems: "center",
    backgroundColor: colors.surface,
    borderRadius: 10,
    height: 36,
    justifyContent: "center",
    width: 36,
  },
  closeText: { color: colors.text, fontSize: 24 },
  input: {
    backgroundColor: colors.background,
    borderColor: colors.border,
    borderRadius: 12,
    borderWidth: 1,
    color: colors.text,
    minHeight: 46,
    paddingHorizontal: 13,
  },
  instructions: { minHeight: 88, paddingTop: 12 },
  fieldLabel: { color: colors.muted, fontSize: 10, fontWeight: "800", letterSpacing: 0.7 },
  options: { flexDirection: "row", flexWrap: "wrap", gap: 7 },
  option: {
    borderColor: colors.border,
    borderRadius: 9,
    borderWidth: 1,
    marginRight: 7,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  optionSelected: { backgroundColor: colors.accentSubtle, borderColor: colors.accent },
  optionText: { color: colors.textSecondary, fontSize: 11, fontWeight: "700" },
  save: {
    alignItems: "center",
    backgroundColor: colors.accent,
    borderRadius: 13,
    justifyContent: "center",
    minHeight: 48,
  },
  saveText: { color: colors.onAccent, fontWeight: "800" },
});

const styles = stylesSheet;
