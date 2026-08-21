import type { Personality } from "../../../contracts";

export type StyleExample = { say: string; writes: string };
type Translate = (descriptor: { id: string; message: string }) => string;

export function styleExampleFor(
  name: string,
  translate: Translate,
): StyleExample | null {
  const normalizedName = name.toLocaleLowerCase();
  if (normalizedName.includes("messag") || normalizedName.includes("chat")) {
    return messagingExample(translate);
  }
  if (normalizedName.includes("mail")) return emailExample(translate);
  if (normalizedName.includes("note")) return notesExample(translate);
  if (normalizedName.includes("cod") || normalizedName.includes("dev")) {
    return codingExample(translate);
  }
  return null;
}

function messagingExample(translate: Translate): StyleExample {
  return {
    say: translate({
      id: "personalization.example.messaging.say",
      message: '"ehh can you move the the meeting to friday morning"',
    }),
    writes: translate({
      id: "personalization.example.messaging.writes",
      message: "can you move the meeting to friday morning? 🙏",
    }),
  };
}

function emailExample(translate: Translate): StyleExample {
  return {
    say: translate({
      id: "personalization.example.email.say",
      message: '"tell ana we need the report by thursday thanks"',
    }),
    writes: translate({
      id: "personalization.example.email.writes",
      message: "Hi Ana — we'll need the report by Thursday. Thank you!",
    }),
  };
}

function notesExample(translate: Translate): StyleExample {
  return {
    say: translate({
      id: "personalization.example.notes.say",
      message: '"the launch moved to october and marketing needs copy"',
    }),
    writes: translate({
      id: "personalization.example.notes.writes",
      message: "• Launch → October · • Marketing copy needed",
    }),
  };
}

function codingExample(translate: Translate): StyleExample {
  return {
    say: translate({
      id: "personalization.example.coding.say",
      message: '"add a use effect that fetches the user on mount"',
    }),
    writes: translate({
      id: "personalization.example.coding.writes",
      message: "Add a useEffect that fetches the user on mount.",
    }),
  };
}

export function stylePreviewKey(
  personality: Personality,
  fallback: StyleExample | null,
): string {
  return [personality.id, fallback?.say ?? "", fallback?.writes ?? ""].join(
    "|",
  );
}
