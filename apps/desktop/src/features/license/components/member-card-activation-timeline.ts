import { estimateTypewriterMs } from "../../../shared/ui/TypewriterText";
import type { CardRevealStage } from "./useCardActivationSequence";

export const REVEAL_NAME_SPEED_MS = 34;
export const REVEAL_VALUE_SPEED_MS = 26;

type TimelineStep = { stage: CardRevealStage; delayMs: number };

const timing = {
  wipe: 750,
  stamp: 650,
  afterStamp: 420,
  afterName: 520,
  afterEmail: 380,
  emailPlaceholder: 420,
  details: 700,
  beforeCoverage: 480,
  afterCoverage: 900,
  floor: 6_400,
} as const;

export const activationTimeline = (
  headline: string | null,
  elapsedMs: number,
): TimelineStep[] => {
  const firstDelay = Math.max(0, timing.wipe - elapsedMs);
  const nameDuration = headline
    ? estimateTypewriterMs(headline, REVEAL_NAME_SPEED_MS)
    : 480;
  const stampEnd = firstDelay + timing.stamp + timing.afterStamp;
  const nameEnd = stampEnd + nameDuration + timing.afterName;
  const emailEnd = nameEnd + timing.afterEmail + timing.emailPlaceholder;
  const coverageStart = emailEnd + timing.details + timing.beforeCoverage;
  const doneAt = Math.max(
    timing.floor - elapsedMs,
    coverageStart + timing.afterCoverage,
  );
  return [
    { stage: "stamp", delayMs: firstDelay },
    { stage: "name", delayMs: stampEnd },
    { stage: "email", delayMs: nameEnd },
    { stage: "details", delayMs: emailEnd },
    { stage: "coverage", delayMs: coverageStart },
    { stage: "done", delayMs: doneAt },
  ];
};

const visibleFrom = (stage: CardRevealStage, firstVisible: CardRevealStage) => {
  const order: CardRevealStage[] = [
    "draft",
    "wiping",
    "stamp",
    "name",
    "email",
    "details",
    "coverage",
    "done",
  ];
  return order.indexOf(stage) >= order.indexOf(firstVisible);
};

export const activationPresentation = (
  active: boolean,
  stage: CardRevealStage,
) => {
  const cinematic = stage !== "draft" && stage !== "done";
  return {
    cinematic,
    typingReveal: cinematic,
    showTierPicker: stage === "draft",
    showStamp: active && visibleFrom(stage, "stamp"),
    showName: active && visibleFrom(stage, "name"),
    showEmail: active && visibleFrom(stage, "email"),
    showDetails: active && visibleFrom(stage, "details"),
    showCoverage: active && visibleFrom(stage, "coverage"),
    stampSlam: stage === "stamp",
  };
};
