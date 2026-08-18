import type { StepMotionProps } from "./shared";
import { IntelligenceStepActions } from "./intelligence-step-actions";
import { IntelligenceStepCard } from "./intelligence-step-card";
import { IntelligenceStepShell } from "./intelligence-step-shell";

type Props = {
  stepMotionProps: StepMotionProps;
  downloading: boolean;
  percent: number;
  onDownload: () => void;
  onNotNow: () => void;
};

export function IntelligenceStep({
  stepMotionProps,
  downloading,
  percent,
  onDownload,
  onNotNow,
}: Props) {
  return (
    <IntelligenceStepShell
      stepMotionProps={stepMotionProps}
      footer={
        <IntelligenceStepActions
          downloading={downloading}
          onDownload={onDownload}
          onNotNow={onNotNow}
        />
      }
    >
      <IntelligenceStepCard downloading={downloading} percent={percent} />
    </IntelligenceStepShell>
  );
}
