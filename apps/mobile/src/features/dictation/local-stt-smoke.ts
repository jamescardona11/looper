const requiredTranscriptPhrases = [
  "stale smell of old beer lingers",
  "cold dip restores health and zest",
  "tacos al pastor are my favorite",
] as const;

export interface LocalSttSmokeEvaluation {
  ok: boolean;
  missingPhrases: string[];
}

export function evaluateLocalSttSmokeTranscript(transcript: string): LocalSttSmokeEvaluation {
  const normalizedTranscript = normalizeTranscript(transcript);
  const missingPhrases = requiredTranscriptPhrases.filter(
    (phrase) => !normalizedTranscript.includes(phrase),
  );

  return { ok: missingPhrases.length === 0, missingPhrases: [...missingPhrases] };
}

function normalizeTranscript(value: string): string {
  return value
    .toLocaleLowerCase("en-US")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}
