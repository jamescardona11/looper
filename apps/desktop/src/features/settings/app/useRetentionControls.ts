import { useLingui } from "@lingui/react/macro";
import { useRef, useState } from "react";
import {
  previewAudioStorageBudget,
  previewRecordingPrune,
  previewTranscriptionPrune,
} from "../../../data/transcription";
import type {
  AutoDeleteTarget,
  RecordingPrunePolicy,
} from "../../../contracts/index";
import {
  audioBudgetNeedsPreview,
  retentionChangePlan,
} from "./retention-policy";
import type { SelectOption } from "./useAppTabOptions";

export type PendingPruneConfirmation = {
  target: AutoDeleteTarget;
  duration: RecordingPrunePolicy;
  candidateCount: number | null;
};

export type PendingBudgetConfirmation = {
  budgetMb: number;
  candidateCount: number | null;
  candidateBytes: number | null;
};

export function useRetentionControls({
  autoDeleteTarget,
  onAutoDeleteTargetChange,
  autoDeleteDuration,
  onAutoDeleteDurationChange,
  audioStorageBudgetMb,
  onAudioStorageBudgetMbChange,
  pruneOptions,
}: {
  autoDeleteTarget: AutoDeleteTarget;
  onAutoDeleteTargetChange: (target: AutoDeleteTarget) => void;
  autoDeleteDuration: RecordingPrunePolicy;
  onAutoDeleteDurationChange: (policy: RecordingPrunePolicy) => void;
  audioStorageBudgetMb: number;
  onAudioStorageBudgetMbChange: (budgetMb: number) => void;
  pruneOptions: SelectOption<RecordingPrunePolicy>[];
}) {
  const { t } = useLingui();
  const [pendingPrune, setPendingPrune] =
    useState<PendingPruneConfirmation | null>(null);
  const [pendingBudget, setPendingBudget] =
    useState<PendingBudgetConfirmation | null>(null);
  const [previewingPrune, setPreviewingPrune] = useState(false);
  const [previewingBudget, setPreviewingBudget] = useState(false);
  const pruneRequestActive = useRef(false);
  const budgetRequestActive = useRef(false);

  const commitPrune = (
    target: AutoDeleteTarget,
    duration: RecordingPrunePolicy,
  ) => {
    onAutoDeleteTargetChange(target);
    onAutoDeleteDurationChange(duration);
  };

  const applyAutoDeleteChange = async (
    nextTarget: AutoDeleteTarget,
    nextDuration: RecordingPrunePolicy,
  ) => {
    if (
      pruneRequestActive.current ||
      (nextTarget === autoDeleteTarget && nextDuration === autoDeleteDuration)
    ) {
      return;
    }
    const plan = retentionChangePlan(
      { target: autoDeleteTarget, policy: autoDeleteDuration },
      { target: nextTarget, policy: nextDuration },
    );
    if (!plan.recordingMoreAggressive && !plan.transcriptionMoreAggressive) {
      commitPrune(nextTarget, nextDuration);
      return;
    }

    pruneRequestActive.current = true;
    setPreviewingPrune(true);
    try {
      const previews = await Promise.allSettled([
        ...(plan.recordingMoreAggressive
          ? [previewRecordingPrune(plan.recordingPolicy)]
          : []),
        ...(plan.transcriptionMoreAggressive
          ? [previewTranscriptionPrune(plan.transcriptionPolicy)]
          : []),
      ]);
      const unknown = previews.some((result) => result.status === "rejected");
      const candidateCount = previews.reduce(
        (total, result) =>
          result.status === "fulfilled"
            ? total + result.value.candidate_count
            : total,
        0,
      );
      if (!unknown && candidateCount === 0) {
        commitPrune(nextTarget, nextDuration);
        return;
      }
      setPendingPrune({
        target: nextTarget,
        duration: nextDuration,
        candidateCount: unknown ? null : candidateCount,
      });
    } finally {
      pruneRequestActive.current = false;
      setPreviewingPrune(false);
    }
  };

  const applyAudioBudgetChange = async (nextBudgetMb: number) => {
    if (budgetRequestActive.current || nextBudgetMb === audioStorageBudgetMb) {
      return;
    }
    if (!audioBudgetNeedsPreview(audioStorageBudgetMb, nextBudgetMb)) {
      onAudioStorageBudgetMbChange(nextBudgetMb);
      return;
    }

    budgetRequestActive.current = true;
    setPreviewingBudget(true);
    try {
      const preview = await previewAudioStorageBudget(nextBudgetMb);
      if (preview.candidate_count === 0) {
        onAudioStorageBudgetMbChange(nextBudgetMb);
        return;
      }
      setPendingBudget({
        budgetMb: nextBudgetMb,
        candidateCount: preview.candidate_count,
        candidateBytes: preview.candidate_bytes,
      });
    } catch {
      setPendingBudget({
        budgetMb: nextBudgetMb,
        candidateCount: null,
        candidateBytes: null,
      });
    } finally {
      budgetRequestActive.current = false;
      setPreviewingBudget(false);
    }
  };

  const confirmPrune = () => {
    if (!pendingPrune) return;
    commitPrune(pendingPrune.target, pendingPrune.duration);
    setPendingPrune(null);
  };
  const confirmBudget = () => {
    if (!pendingBudget) return;
    onAudioStorageBudgetMbChange(pendingBudget.budgetMb);
    setPendingBudget(null);
  };

  return {
    applyAudioBudgetChange,
    applyAutoDeleteChange,
    handleCloseBudgetConfirmation: () => setPendingBudget(null),
    handleClosePruneConfirmation: () => setPendingPrune(null),
    handleConfirmBudgetChange: confirmBudget,
    handleConfirmPruneChange: confirmPrune,
    isPreviewingBudget: previewingBudget,
    isPreviewingPrune: previewingPrune,
    pendingBudgetConfirmation: pendingBudget,
    pendingPruneConfirmation: pendingPrune,
    pruneConfirmationFootnote: pruneFootnote(pendingPrune, t),
    pruneConfirmationMessage: pendingPrune
      ? pruneMessage(pendingPrune, pruneOptions, t)
      : "",
  };
}

type Translator = ReturnType<typeof useLingui>["t"];

function pruneMessage(
  pending: PendingPruneConfirmation,
  options: SelectOption<RecordingPrunePolicy>[],
  t: Translator,
) {
  const policyLabel =
    options.find((option) => option.value === pending.duration)?.label ??
    pending.duration;
  const noun =
    pending.target === "audio"
      ? pending.candidateCount === 1
        ? t({ id: "settings.app.prune.noun.audio.one", message: "audio file" })
        : t({
            id: "settings.app.prune.noun.audio.other",
            message: "audio files",
          })
      : pending.candidateCount === 1
        ? t({
            id: "settings.app.prune.noun.transcripts.one",
            message: "transcript",
          })
        : t({
            id: "settings.app.prune.noun.transcripts.other",
            message: "transcripts",
          });

  if (pending.duration === "immediately") {
    return pending.candidateCount === null
      ? t({
          id: "settings.app.auto_delete.confirm.immediately.unknown_count",
          message: `Changing auto-delete to ${{ policyLabel }} may immediately delete your existing ${{ noun }}.`,
        })
      : t({
          id: "settings.app.auto_delete.confirm.immediately.known_count",
          message: `Changing auto-delete to ${{ policyLabel }} will immediately delete ${pending.candidateCount} existing ${{ noun }}.`,
        });
  }

  const threshold = pruneThreshold(pending.duration, t);
  if (!threshold) return "";
  return pending.candidateCount === null
    ? t({
        id: "settings.app.auto_delete.confirm.threshold.unknown_count",
        message: `Changing auto-delete to ${{ policyLabel }} may immediately delete ${{ noun }} already older than ${{ threshold }}.`,
      })
    : t({
        id: "settings.app.auto_delete.confirm.threshold.known_count",
        message: `Changing auto-delete to ${{ policyLabel }} will immediately delete ${pending.candidateCount} ${{ noun }} already older than ${{ threshold }}.`,
      });
}

function pruneThreshold(policy: RecordingPrunePolicy, t: Translator) {
  switch (policy) {
    case "immediately":
      return t({
        id: "settings.app.prune.threshold.immediately",
        message: "right now",
      });
    case "day":
      return t({ id: "settings.app.prune.threshold.day", message: "a day" });
    case "week":
      return t({ id: "settings.app.prune.threshold.week", message: "a week" });
    case "month":
      return t({
        id: "settings.app.prune.threshold.month",
        message: "a month",
      });
    case "year":
      return t({ id: "settings.app.prune.threshold.year", message: "a year" });
    default:
      return null;
  }
}

function pruneFootnote(
  pending: PendingPruneConfirmation | null,
  t: Translator,
) {
  if (!pending) return "";
  if (pending.candidateCount === null) {
    return t({
      id: "settings.app.auto_delete.confirm.unknown_count",
      message:
        "We couldn't count them right now, but auto-delete will still run as soon as you save this change.",
    });
  }
  return pending.target === "audio"
    ? t({
        id: "settings.app.auto_delete.confirm.audio_only",
        message: "This only removes saved audio files, not your transcripts.",
      })
    : t({
        id: "settings.app.auto_delete.confirm.audio_too",
        message: "Deleting transcripts also removes the audio they reference.",
      });
}
