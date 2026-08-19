import { Brain, LockSimple } from "@phosphor-icons/react";

type IntelligenceStepCardProps = {
  downloading: boolean;
  percent: number;
};

export function IntelligenceStepCard({
  downloading,
  percent,
}: IntelligenceStepCardProps) {
  return (
    <div className="onboarding-intelligence-card w-full rounded-xl border border-border-secondary bg-surface-elevated p-5 text-left">
      <div className="flex items-start gap-3">
        <div className="rounded-lg bg-cloud/10 p-2 text-cloud">
          <Brain size={22} weight="duotone" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-3">
            <h3 className="ui-text-body-lg font-semibold text-content-primary">
              Qwen 3.5 4B
            </h3>
            <span className="ui-text-meta text-content-muted">2.29 GB</span>
          </div>
          <p className="mt-1 ui-text-body-sm text-content-muted">
            Generates meeting summaries and answers questions without sending
            the transcript to a provider.
          </p>
          <div className="mt-4 flex items-center gap-2 ui-text-meta text-content-secondary">
            <LockSimple size={14} />
            On-device processing
          </div>
          {downloading ? (
            <div className="mt-4">
              <div className="h-1.5 overflow-hidden rounded-full bg-surface-hover">
                <div
                  className="h-full rounded-full bg-cloud transition-[width]"
                  style={{ width: `${percent}%` }}
                />
              </div>
              <p className="mt-2 ui-text-meta text-content-muted">
                {Math.round(percent)}% · Download continues in the background
              </p>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
