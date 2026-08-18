import { useCallback, useLayoutEffect, useRef, useState } from "react";
import { useMountEffect } from "../../../shared/hooks/useMountEffect";
import {
  activationPresentation,
  activationTimeline,
  REVEAL_NAME_SPEED_MS,
  REVEAL_VALUE_SPEED_MS,
} from "./member-card-activation-timeline";

export type CardRevealStage =
  | "draft"
  | "wiping"
  | "stamp"
  | "name"
  | "email"
  | "details"
  | "coverage"
  | "done";

export { REVEAL_NAME_SPEED_MS, REVEAL_VALUE_SPEED_MS };

type SequenceRuntime = {
  started: boolean;
  scheduled: boolean;
  userActivated: boolean;
  previousActive: boolean;
  lastAttempt: number;
  wipeStartedAt: number | null;
};

export function useCardActivationSequence(
  activating: boolean,
  active: boolean,
  headlineText: string | null,
  licenseReady: boolean,
  licenseLoading: boolean,
  activationAttempt: number,
  onRevealComplete?: () => void,
) {
  const [stage, setStage] = useState<CardRevealStage>(() =>
    active ? "done" : "draft",
  );
  const [isUserActivationReveal, setUserActivationReveal] = useState(false);
  const timerIds = useRef<number[]>([]);
  const headline = useRef(headlineText);
  const completion = useRef(onRevealComplete);
  const runtime = useRef<SequenceRuntime>({
    started: false,
    scheduled: false,
    userActivated: false,
    previousActive: active,
    lastAttempt: 0,
    wipeStartedAt: null,
  });
  headline.current = headlineText;
  completion.current = onRevealComplete;

  const cancelTimeline = useCallback(() => {
    for (const timerId of timerIds.current) window.clearTimeout(timerId);
    timerIds.current = [];
  }, []);

  const startReveal = useCallback(() => {
    cancelTimeline();
    runtime.current.started = true;
    runtime.current.scheduled = false;
    runtime.current.wipeStartedAt = Date.now();
    setUserActivationReveal(true);
    setStage("wiping");
  }, [cancelTimeline]);

  useMountEffect(() => cancelTimeline);

  useLayoutEffect(() => {
    const sequence = runtime.current;
    if (activationAttempt > 0 && activationAttempt !== sequence.lastAttempt) {
      sequence.lastAttempt = activationAttempt;
      sequence.userActivated = true;
    }
    if (activating) sequence.userActivated = true;

    const becameActive = active && !sequence.previousActive;
    const becameInactive = !active && sequence.previousActive;
    sequence.previousActive = active;

    if (!activating && !active) {
      cancelTimeline();
      sequence.started = false;
      sequence.scheduled = false;
      sequence.wipeStartedAt = null;
      if (becameInactive || activationAttempt <= 0) {
        sequence.userActivated = false;
      }
      setUserActivationReveal(false);
      setStage("draft");
      return;
    }

    if (
      !licenseLoading &&
      active &&
      stage === "draft" &&
      !sequence.userActivated &&
      !sequence.started
    ) {
      sequence.started = true;
      sequence.scheduled = true;
      setUserActivationReveal(false);
      setStage("done");
      return;
    }

    if (becameActive && !sequence.started && !sequence.userActivated) {
      sequence.started = true;
      sequence.scheduled = true;
      setUserActivationReveal(false);
      setStage("done");
      return;
    }

    if (
      !sequence.started &&
      (becameActive || activating || (active && sequence.userActivated))
    ) {
      startReveal();
      return;
    }

    if (!active || stage !== "wiping" || sequence.scheduled || !licenseReady) {
      return;
    }

    sequence.scheduled = true;
    const elapsed = Date.now() - (sequence.wipeStartedAt ?? Date.now());
    for (const step of activationTimeline(headline.current, elapsed)) {
      const timerId = window.setTimeout(() => {
        setStage(step.stage);
        if (step.stage === "done") completion.current?.();
      }, step.delayMs);
      timerIds.current.push(timerId);
    }
  }, [
    activating,
    active,
    activationAttempt,
    cancelTimeline,
    licenseLoading,
    licenseReady,
    stage,
    startReveal,
  ]);

  return {
    stage,
    isUserActivationReveal,
    ...activationPresentation(active, stage),
  };
}
