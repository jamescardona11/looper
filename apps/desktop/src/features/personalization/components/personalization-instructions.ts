import personalizationLimits from "../../../../personalization-limits.json";

export const MAX_INSTRUCTIONS_CHARS = personalizationLimits.maxInstructionChars;
export const DEFAULT_INSTRUCTIONS_HEIGHT = 128;

const INSTRUCTION_HEIGHT_RANGE = {
  minimum: Math.round(DEFAULT_INSTRUCTIONS_HEIGHT * 0.8),
  maximum: Math.round(DEFAULT_INSTRUCTIONS_HEIGHT * 2.5),
} as const;

function instructionCharacters(value: string) {
  return [...value];
}

export function normalizeEntry(value: string) {
  return value.trim();
}

export function countInstructionsChars(value: string) {
  return instructionCharacters(value).length;
}

export function clampInstructionsText(value: string) {
  const characters = instructionCharacters(value);
  return characters.length > MAX_INSTRUCTIONS_CHARS
    ? characters.slice(0, MAX_INSTRUCTIONS_CHARS).join("")
    : value;
}

export function clampInstructionsHeight(value: number) {
  return Math.max(
    INSTRUCTION_HEIGHT_RANGE.minimum,
    Math.min(value, INSTRUCTION_HEIGHT_RANGE.maximum),
  );
}
