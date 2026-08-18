import { useMemo, useSyncExternalStore } from "react";
import type { MeetingAiProvider } from "../../../types";
import { LOCAL_LLM_MODEL_ID } from "../../../data/local-llm";
import SegmentedControl from "../../../shared/ui/SegmentedControl";
import { createMeetingModelStore } from "../meeting-model-store";

type Props = {
  provider: MeetingAiProvider;
  setProvider: (provider: MeetingAiProvider) => void;
  model: string;
  setModel: (model: string) => void;
};

export default function MeetingIntelligencePanel({
  provider,
  setProvider,
  model,
  setModel,
}: Props) {
  const selectedModel = model || LOCAL_LLM_MODEL_ID;
  const modelStore = useMemo(
    () => createMeetingModelStore(selectedModel),
    [selectedModel],
  );
  const { info, status, percent, error } = useSyncExternalStore(
    modelStore.subscribe,
    modelStore.getSnapshot,
    modelStore.getSnapshot,
  );

  const downloading =
    status?.state === "downloading" || status?.state === "verifying";

  return (
    <div className="rounded-xl border border-border/70 bg-card p-4 shadow-sm">
      <div className="mb-3">
        <h3 className="text-sm font-semibold">Meeting intelligence</h3>
        <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
          Choose where meeting summaries and questions run. Local never uploads
          the transcript.
        </p>
      </div>
      <SegmentedControl
        value={provider}
        onChange={setProvider}
        options={[
          { value: "local", label: "Local" },
          { value: "writing", label: "Writing provider" },
          { value: "none", label: "Off" },
        ]}
      />

      {provider === "local" && (
        <div className="mt-4 rounded-lg border border-border/60 bg-background/60 p-3">
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="text-sm font-medium">
                {info?.label ?? "Qwen 3.5 4B"}
              </div>
              <p className="mt-1 text-xs text-muted-foreground">
                2.29 GB · Spanish and Portuguese · On-device · Apache-2.0
              </p>
            </div>
            <span className="rounded-full bg-muted px-2 py-1 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
              {status?.state.replace(/_/g, " ") ?? "checking"}
            </span>
          </div>
          {downloading && (
            <div className="mt-3">
              <div className="h-1.5 overflow-hidden rounded-full bg-muted">
                <div
                  className="h-full rounded-full bg-primary transition-[width]"
                  style={{ width: `${percent}%` }}
                />
              </div>
              <p className="mt-1.5 text-[11px] text-muted-foreground">
                {status?.state === "verifying"
                  ? "Verifying download…"
                  : `${Math.round(percent)}% downloaded`}
              </p>
            </div>
          )}
          {error && <p className="mt-2 text-xs text-destructive">{error}</p>}
          <div className="mt-3 flex gap-2">
            {status?.state === "ready" ? (
              <button
                type="button"
                className="rounded-md border border-border px-3 py-1.5 text-xs font-medium hover:bg-muted"
                onClick={() => void modelStore.remove()}
              >
                Delete
              </button>
            ) : downloading ? (
              <button
                type="button"
                className="rounded-md border border-border px-3 py-1.5 text-xs font-medium hover:bg-muted"
                onClick={() => void modelStore.cancel()}
              >
                Cancel
              </button>
            ) : (
              <button
                type="button"
                className="rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50"
                disabled={status?.state === "license_required"}
                onClick={() => {
                  setModel(selectedModel);
                  void modelStore.download();
                }}
              >
                {error ? "Retry" : "Download"}
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
