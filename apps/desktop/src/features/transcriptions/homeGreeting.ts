import {
  timeOfDayPeriod,
  type TimeOfDayPeriod,
} from "./home-period";
import { pickStableForCurrentPeriod } from "./stable-period-choice";

export {
  timeOfDayPeriod,
  useTimeOfDayPeriodTick,
  type TimeOfDayPeriod,
} from "./home-period";
export { pickStableForCurrentPeriod } from "./stable-period-choice";

type GreetingDescriptor = { id: string; message: string };
type TimeGreeting = Readonly<{ kind: "time" }>;

const PERIOD_GREETINGS: Record<TimeOfDayPeriod, GreetingDescriptor> = {
  morning: {
    id: "home.greeting.morning",
    message: "Good morning",
  },
  afternoon: {
    id: "home.greeting.afternoon",
    message: "Good afternoon",
  },
  evening: {
    id: "home.greeting.evening",
    message: "Good evening",
  },
};

const OCCASIONS = {
  leap_day: {
    id: "home.greeting.occasion.leap_day",
    message: "Happy leap day",
    occursOn: (date) => date.getMonth() === 1 && date.getDate() === 29,
  },
} satisfies Record<
  string,
  GreetingDescriptor & { occursOn: (date: Date) => boolean }
>;

export type HomeOccasionId = keyof typeof OCCASIONS;
type OccasionGreeting = Readonly<{
  kind: "occasion";
  id: HomeOccasionId;
}>;
export type HomeGreetingVariant = TimeGreeting | OccasionGreeting;

function occasionsOn(now: Date = new Date()): HomeOccasionId[] {
  return (Object.keys(OCCASIONS) as HomeOccasionId[]).filter((id) =>
    OCCASIONS[id].occursOn(now),
  );
}

function selectGreetingVariant(
  now: Date = new Date(),
): HomeGreetingVariant {
  const occasionVariants = occasionsOn(now).map(
    (id): HomeGreetingVariant => ({ kind: "occasion", id }),
  );
  return (
    pickStableForCurrentPeriod<HomeGreetingVariant>(
      [{ kind: "time" }, ...occasionVariants],
      0,
      now,
    ) ?? { kind: "time" }
  );
}

function greetingCacheKey(
  variant: HomeGreetingVariant,
  now: Date = new Date(),
) {
  return variant.kind === "occasion"
    ? `occasion-${variant.id}`
    : `time-${timeOfDayPeriod(now)}`;
}

function translateGreeting(
  variant: HomeGreetingVariant,
  translate: (descriptor: GreetingDescriptor) => string,
) {
  const descriptor =
    variant.kind === "occasion"
      ? OCCASIONS[variant.id]
      : PERIOD_GREETINGS[timeOfDayPeriod()];
  return translate(descriptor);
}

export {
  occasionsOn as getHomeOccasions,
  selectGreetingVariant as getHomeGreetingVariant,
  greetingCacheKey as homeGreetingKey,
  translateGreeting as labelForHomeGreeting,
};
