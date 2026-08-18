export interface WritingStyle {
  id: string;
  name: string;
  description: string;
  promptTemplate: string;
  example: string;
}

export interface SmartMode {
  id: string;
  name: string;
  enabled: boolean;
  triggerType: "manual" | "bundle_id";
  triggerValue: string;
  styleId: string;
  format: "none" | "email" | "message" | "bullets" | "todo";
  instructions: string;
}

export interface MobileStudioSettings {
  styles: WritingStyle[];
  activeStyleId: string;
  smartModes: SmartMode[];
  language?: string;
}

export const builtInStyles: WritingStyle[] = [
  {
    id: "concise",
    name: "Claro y breve",
    description: "Directo, limpio, sin muletillas",
    promptTemplate:
      "Rewrite concisely and directly. Remove filler while preserving every fact and the speaker's intent.",
    example: "Te envío la propuesta hoy. Incluye alcance, tiempos y próximos pasos.",
  },
  {
    id: "warm",
    name: "Cálido",
    description: "Cercano y profesional",
    promptTemplate:
      "Use a warm, natural, professional tone. Do not add promises, greetings, or facts the speaker did not say.",
    example: "Hola Ana, te comparto la propuesta. Quedo atento a tus comentarios.",
  },
  {
    id: "structured",
    name: "Notas estructuradas",
    description: "Títulos, bullets y tareas",
    promptTemplate:
      "Organize the exact content into concise headings, bullets, and explicit action items when present.",
    example: "Propuesta\n• Envío: hoy\n• Incluye: alcance y tiempos\n• Siguiente: revisión",
  },
];

export function normalizeStudioSettings(value: unknown): MobileStudioSettings {
  const root = asRecord(value) ?? {};
  const customStyles = Array.isArray(root.styles)
    ? root.styles.flatMap((item, index) => styleFromUnknown(item, index))
    : [];
  const styles = dedupeStyles([...builtInStyles, ...customStyles]);
  const smartModes = Array.isArray(root.smartModes) ? root.smartModes.flatMap(modeFromUnknown) : [];
  const requestedActive = stringValue(root.activeStyleId);
  return {
    styles,
    activeStyleId: styles.some((style) => style.id === requestedActive)
      ? (requestedActive as string)
      : (styles[0]?.id ?? "concise"),
    smartModes,
    ...(stringValue(root.language) ? { language: stringValue(root.language) as string } : {}),
  };
}

export function studioSettingsData(settings: MobileStudioSettings): Record<string, unknown> {
  return {
    styles: settings.styles.filter(
      (style) => !builtInStyles.some((builtIn) => builtIn.id === style.id),
    ),
    activeStyleId: settings.activeStyleId,
    smartModes: settings.smartModes,
    ...(settings.language ? { language: settings.language } : {}),
  };
}

export function createSmartMode(input: {
  name: string;
  styleId: string;
  format: SmartMode["format"];
  instructions: string;
}): SmartMode {
  const name = input.name.trim() || "Nuevo modo";
  return {
    id: `mode_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    name,
    enabled: true,
    triggerType: "manual",
    triggerValue: "",
    styleId: input.styleId,
    format: input.format,
    instructions: input.instructions.trim(),
  };
}

export function smartModePrompt(mode: SmartMode, styles: WritingStyle[]): string {
  const style = styles.find((item) => item.id === mode.styleId);
  const format = formatInstruction(mode.format);
  return [style?.promptTemplate, format, mode.instructions].filter(Boolean).join("\n\n");
}

function styleFromUnknown(value: unknown, index: number): WritingStyle[] {
  const row = asRecord(value);
  if (!row) return [];
  const name = stringValue(row.name);
  const promptTemplate = stringValue(row.promptTemplate) ?? stringValue(row.instructions);
  if (!name || !promptTemplate) return [];
  return [
    {
      id: stringValue(row.id) ?? `imported-${slug(name)}-${index}`,
      name,
      description: stringValue(row.description) ?? "Importado",
      promptTemplate,
      example: stringValue(row.example) ?? "Vista previa disponible al usar este estilo.",
    },
  ];
}

function modeFromUnknown(value: unknown): SmartMode[] {
  const row = asRecord(value);
  if (!row) return [];
  const id = stringValue(row.id);
  const name = stringValue(row.name);
  const styleId = stringValue(row.styleId);
  if (!id || !name || !styleId) return [];
  const format = stringValue(row.format);
  return [
    {
      id,
      name,
      enabled: row.enabled !== false,
      triggerType: row.triggerType === "bundle_id" ? "bundle_id" : "manual",
      triggerValue: stringValue(row.triggerValue) ?? "",
      styleId,
      format:
        format === "email" || format === "message" || format === "bullets" || format === "todo"
          ? format
          : "none",
      instructions: stringValue(row.instructions) ?? "",
    },
  ];
}

function formatInstruction(format: SmartMode["format"]): string {
  if (format === "email")
    return "Format as an email using short paragraphs. Preserve only greetings and sign-offs the speaker said.";
  if (format === "message") return "Format as a concise chat message, not a formal email.";
  if (format === "bullets")
    return "Format explicit points as a bulleted list in their original order.";
  if (format === "todo")
    return "Format explicit tasks as a checklist; preserve owners and dates only when spoken.";
  return "";
}

function dedupeStyles(styles: WritingStyle[]): WritingStyle[] {
  return [...new Map(styles.map((style) => [style.id, style])).values()];
}

function slug(value: string): string {
  return value
    .toLocaleLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

function stringValue(value: unknown): string | null {
  if (typeof value !== "string") return null;
  return value.trim() || null;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}
