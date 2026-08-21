import type {
  AutoDeleteTarget,
  RecordingPrunePolicy,
} from "../../../types/index";

const POLICY_SEVERITY: Record<RecordingPrunePolicy, number> = {
  never: 0,
  year: 1,
  three_months: 1,
  month: 3,
  week: 4,
  day: 5,
  immediately: 6,
};

export function retentionChangePlan(
  current: { target: AutoDeleteTarget; policy: RecordingPrunePolicy },
  next: { target: AutoDeleteTarget; policy: RecordingPrunePolicy },
) {
  const currentPolicies = policiesFor(current.target, current.policy);
  const nextPolicies = policiesFor(next.target, next.policy);
  return {
    ...nextPolicies,
    recordingMoreAggressive: isMoreAggressive(
      nextPolicies.recordingPolicy,
      currentPolicies.recordingPolicy,
    ),
    transcriptionMoreAggressive: isMoreAggressive(
      nextPolicies.transcriptionPolicy,
      currentPolicies.transcriptionPolicy,
    ),
  };
}

export function audioBudgetNeedsPreview(currentMb: number, nextMb: number) {
  if (nextMb === currentMb || nextMb === 0) return false;
  return currentMb === 0 || nextMb < currentMb;
}

function policiesFor(target: AutoDeleteTarget, policy: RecordingPrunePolicy) {
  return {
    recordingPolicy: target === "audio" ? policy : ("never" as const),
    transcriptionPolicy: target === "transcripts" ? policy : ("never" as const),
  };
}

function isMoreAggressive(
  next: RecordingPrunePolicy,
  current: RecordingPrunePolicy,
) {
  return POLICY_SEVERITY[next] > POLICY_SEVERITY[current];
}
