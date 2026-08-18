import {
  useDictationDictionary,
  useDictationReplacements,
  useDictationSnippets,
  useDictationSettings,
} from "@looper/data";
import { useMemo, useState } from "react";
import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { colors, Screen } from "@/shared/components/screen";
import { normalizeStudioSettings } from "@/shared/studio/studio-settings";
import {
  isNativeKeyboardAvailable,
  isNativeKeyboardEnabled,
  openNativeKeyboardSettings,
} from "./native-keyboard";
import { syncKeyboardContent } from "./sync-keyboard-content";

export function KeyboardScreen() {
  const dictionary = useDictationDictionary();
  const replacements = useDictationReplacements();
  const snippets = useDictationSnippets();
  const settings = useDictationSettings();
  const studio = useMemo(() => normalizeStudioSettings(settings.doc?.data), [settings.doc?.data]);
  const [term, setTerm] = useState("");
  const [replacementSource, setReplacementSource] = useState("");
  const [replacementDestination, setReplacementDestination] = useState("");
  const [trigger, setTrigger] = useState("");
  const [expansion, setExpansion] = useState("");
  const [status, setStatus] = useState<string | null>(null);

  const sync = async () => {
    setStatus("Sincronizando con el teclado…");
    try {
      await syncKeyboardContent({
        entries: dictionary.entries,
        replacements: replacements.rules,
        snippets: snippets.snippets,
        studio,
      });
      const enabled = await isNativeKeyboardEnabled();
      setStatus(
        enabled
          ? "Teclado sincronizado y habilitado."
          : "Teclado sincronizado. Actívalo en Ajustes.",
      );
    } catch (cause) {
      setStatus(cause instanceof Error ? cause.message : "No se pudo sincronizar el teclado.");
    }
  };

  return (
    <Screen title="Teclado">
      <Text style={styles.intro}>
        Dicta en cualquier campo de texto con el teclado nativo de Looper. El acceso se comparte
        sólo con la extensión del teclado instalada en este dispositivo.
      </Text>
      <View style={styles.card}>
        <Text style={styles.cardTitle}>Estado</Text>
        <Text style={styles.cardBody}>
          {isNativeKeyboardAvailable()
            ? "El puente nativo está disponible en este development build."
            : "Este runtime no incluye el teclado. Usa un development build, no Expo Go."}
        </Text>
        <View style={styles.actions}>
          <Pressable onPress={() => void sync()} style={styles.primaryButton}>
            <Text style={styles.primaryButtonText}>Sincronizar</Text>
          </Pressable>
          <Pressable
            onPress={() => void openNativeKeyboardSettings().catch(showError(setStatus))}
            style={styles.secondaryButton}
          >
            <Text style={styles.secondaryButtonText}>Abrir ajustes</Text>
          </Pressable>
        </View>
        {status ? <Text style={styles.status}>{status}</Text> : null}
      </View>
      <OutputFormatsCard />
      <DictionaryEditor
        onAdd={async () => {
          if (!term.trim()) return;
          await dictionary.add(term);
          setTerm("");
          setStatus("Término guardado. El teclado se actualiza automáticamente.");
        }}
        term={term}
        onChangeTerm={setTerm}
        entries={dictionary.entries.map((entry) => ({ id: entry.id, value: entry.term }))}
        onRemove={async (id) => {
          await dictionary.remove(id);
          setStatus("Término eliminado. El teclado se actualiza automáticamente.");
        }}
      />
      <ReplacementEditor
        destination={replacementDestination}
        onAdd={async () => {
          if (!replacementSource.trim() || !replacementDestination.trim()) return;
          await replacements.add(replacementSource, replacementDestination);
          setReplacementSource("");
          setReplacementDestination("");
          setStatus("Reemplazo guardado. El teclado se actualiza automáticamente.");
        }}
        onChangeDestination={setReplacementDestination}
        onChangeSource={setReplacementSource}
        onRemove={async (id) => {
          await replacements.remove(id);
          setStatus("Reemplazo eliminado. El teclado se actualiza automáticamente.");
        }}
        replacements={replacements.rules.map((rule) => ({
          id: rule.id,
          value: `${rule.source} → ${rule.destination}`,
        }))}
        source={replacementSource}
      />
      <SnippetEditor
        expansion={expansion}
        onAdd={async () => {
          if (!trigger.trim() || !expansion.trim()) return;
          await snippets.add(trigger, expansion);
          setTrigger("");
          setExpansion("");
          setStatus("Snippet guardado. El teclado se actualiza automáticamente.");
        }}
        onChangeExpansion={setExpansion}
        onChangeTrigger={setTrigger}
        onRemove={async (id) => {
          await snippets.remove(id);
          setStatus("Snippet eliminado. El teclado se actualiza automáticamente.");
        }}
        snippets={snippets.snippets.map((snippet) => ({
          id: snippet.id,
          value: `${snippet.trigger} → ${snippet.expansion}`,
        }))}
        trigger={trigger}
      />
    </Screen>
  );
}

function OutputFormatsCard() {
  return (
    <View style={styles.card}>
      <Text style={styles.cardTitle}>Formato de salida</Text>
      <Text style={styles.cardBody}>
        El teclado separa el estilo de escritura de la estructura. Elige un formato en el teclado
        antes de dictar; vuelve a tocarlo para quitarlo.
      </Text>
      <View style={styles.formatList}>
        <OutputFormat name="Bullets" description="Una idea por punto, en el orden dictado." />
        <OutputFormat
          name="Email"
          description="Párrafos claros; conserva saludos y cierres sólo si los dictaste."
        />
        <OutputFormat
          name="Message"
          description="Mensaje breve y natural, sin volverlo un correo formal."
        />
        <OutputFormat
          name="To-do"
          description="Checklist de tareas explícitas, con responsables y fechas cuando los digas."
        />
      </View>
    </View>
  );
}

function OutputFormat({ name, description }: { name: string; description: string }) {
  return (
    <View style={styles.formatRow}>
      <Text style={styles.formatName}>{name}</Text>
      <Text style={styles.formatDescription}>{description}</Text>
    </View>
  );
}

function DictionaryEditor({
  term,
  entries,
  onChangeTerm,
  onAdd,
  onRemove,
}: {
  term: string;
  entries: KeyboardItem[];
  onChangeTerm: (value: string) => void;
  onAdd: () => Promise<void>;
  onRemove: (id: string) => Promise<void>;
}) {
  return (
    <View style={styles.card}>
      <Text style={styles.cardTitle}>Diccionario</Text>
      <Text style={styles.cardBody}>Nombres y términos que el dictado debe reconocer.</Text>
      <TextInput
        onChangeText={onChangeTerm}
        placeholder="Ej. Telepatia"
        placeholderTextColor={colors.muted}
        style={styles.input}
        value={term}
      />
      <Pressable onPress={() => void onAdd()} style={styles.secondaryButton}>
        <Text style={styles.secondaryButtonText}>Añadir término</Text>
      </Pressable>
      {entries.map((entry) => (
        <KeyboardItemRow entry={entry} key={entry.id} onRemove={onRemove} />
      ))}
    </View>
  );
}

function ReplacementEditor({
  source,
  destination,
  replacements,
  onChangeSource,
  onChangeDestination,
  onAdd,
  onRemove,
}: {
  source: string;
  destination: string;
  replacements: KeyboardItem[];
  onChangeSource: (value: string) => void;
  onChangeDestination: (value: string) => void;
  onAdd: () => Promise<void>;
  onRemove: (id: string) => Promise<void>;
}) {
  return (
    <View style={styles.card}>
      <Text style={styles.cardTitle}>Reemplazos</Text>
      <Text style={styles.cardBody}>Corrige una palabra dictada antes de insertarla.</Text>
      <TextInput
        onChangeText={onChangeSource}
        placeholder="Lo que dices"
        placeholderTextColor={colors.muted}
        style={styles.input}
        value={source}
      />
      <TextInput
        onChangeText={onChangeDestination}
        placeholder="Lo que debe escribirse"
        placeholderTextColor={colors.muted}
        style={styles.input}
        value={destination}
      />
      <Pressable onPress={() => void onAdd()} style={styles.secondaryButton}>
        <Text style={styles.secondaryButtonText}>Añadir reemplazo</Text>
      </Pressable>
      {replacements.map((entry) => (
        <KeyboardItemRow entry={entry} key={entry.id} onRemove={onRemove} />
      ))}
    </View>
  );
}

function SnippetEditor({
  trigger,
  expansion,
  snippets,
  onChangeTrigger,
  onChangeExpansion,
  onAdd,
  onRemove,
}: {
  trigger: string;
  expansion: string;
  snippets: KeyboardItem[];
  onChangeTrigger: (value: string) => void;
  onChangeExpansion: (value: string) => void;
  onAdd: () => Promise<void>;
  onRemove: (id: string) => Promise<void>;
}) {
  return (
    <View style={styles.card}>
      <Text style={styles.cardTitle}>Snippets</Text>
      <Text style={styles.cardBody}>Atajos de voz que se expanden antes de insertarse.</Text>
      <TextInput
        onChangeText={onChangeTrigger}
        placeholder="Disparador"
        placeholderTextColor={colors.muted}
        style={styles.input}
        value={trigger}
      />
      <TextInput
        onChangeText={onChangeExpansion}
        placeholder="Texto expandido"
        placeholderTextColor={colors.muted}
        style={styles.input}
        value={expansion}
      />
      <Pressable onPress={() => void onAdd()} style={styles.secondaryButton}>
        <Text style={styles.secondaryButtonText}>Añadir snippet</Text>
      </Pressable>
      {snippets.map((entry) => (
        <KeyboardItemRow entry={entry} key={entry.id} onRemove={onRemove} />
      ))}
    </View>
  );
}

function KeyboardItemRow({
  entry,
  onRemove,
}: {
  entry: KeyboardItem;
  onRemove: (id: string) => Promise<void>;
}) {
  return (
    <View style={styles.listRow}>
      <Text style={styles.listItem}>• {entry.value}</Text>
      <Pressable onPress={() => void onRemove(entry.id)} style={styles.removeButton}>
        <Text style={styles.removeButtonText}>Eliminar</Text>
      </Pressable>
    </View>
  );
}

function showError(setStatus: (value: string) => void) {
  return (cause: unknown) =>
    setStatus(cause instanceof Error ? cause.message : "No se pudieron abrir los ajustes.");
}

const styles = StyleSheet.create({
  intro: { color: colors.textSecondary, fontSize: 16, lineHeight: 23 },
  card: { backgroundColor: colors.surface, borderRadius: 16, gap: 10, padding: 18 },
  cardTitle: { color: colors.text, fontSize: 18, fontWeight: "700" },
  cardBody: { color: colors.textSecondary, lineHeight: 20 },
  actions: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  primaryButton: {
    backgroundColor: colors.accent,
    borderRadius: 10,
    paddingHorizontal: 16,
    paddingVertical: 11,
  },
  primaryButtonText: { color: colors.onAccent, fontWeight: "700" },
  secondaryButton: {
    alignSelf: "flex-start",
    borderColor: colors.borderStrong,
    borderRadius: 10,
    borderWidth: 1,
    paddingHorizontal: 15,
    paddingVertical: 10,
  },
  secondaryButtonText: { color: colors.text, fontWeight: "700" },
  status: { color: colors.accent, lineHeight: 20 },
  formatList: { gap: 10 },
  formatRow: {
    borderColor: colors.borderStrong,
    borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth,
    gap: 2,
    padding: 12,
  },
  formatName: { color: colors.text, fontWeight: "700" },
  formatDescription: { color: colors.textSecondary, lineHeight: 19 },
  input: {
    borderColor: colors.borderStrong,
    borderRadius: 10,
    borderWidth: 1,
    color: colors.text,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  listItem: { color: colors.text, lineHeight: 21 },
  listRow: { alignItems: "center", flexDirection: "row", justifyContent: "space-between" },
  removeButton: { paddingHorizontal: 4, paddingVertical: 6 },
  removeButtonText: { color: colors.danger, fontSize: 13, fontWeight: "700" },
});

interface KeyboardItem {
  id: string;
  value: string;
}
