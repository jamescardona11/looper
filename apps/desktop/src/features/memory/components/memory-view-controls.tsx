import { MagnifyingGlass } from "@phosphor-icons/react";

import type { MemorySource } from "../../../data/memory";
import DotMatrix from "../../../shared/ui/DotMatrix";
import { MEMORY_DATE_WINDOWS, MEMORY_SOURCE_LABELS } from "./memory-view-model";

type MemoryViewControlsProps = {
  query: string;
  onQueryChange: (value: string) => void;
  loading: boolean;
  fetching: boolean;
  sources: MemorySource[];
  onToggleSource: (source: MemorySource) => void;
  days: number | null;
  onDaysChange: (days: number | null) => void;
  advanced: boolean;
  onShowAdvanced: () => void;
  appId: string;
  onAppIdChange: (value: string) => void;
  workflowId: string;
  onWorkflowIdChange: (value: string) => void;
};

export function MemoryViewControls(props: MemoryViewControlsProps) {
  const selectedSources = new Set(props.sources);
  return (
    <>
      <label className="flex shrink-0 items-center gap-3 border-b border-border-primary px-5 py-4">
        <MagnifyingGlass
          size={17}
          className="shrink-0 text-content-disabled"
          aria-hidden="true"
        />
        <input
          value={props.query}
          onChange={(event) => props.onQueryChange(event.target.value)}
          placeholder="Search everything you said — or just browse below"
          className="min-w-0 flex-1 bg-transparent ui-text-body-lg ui-color-primary outline-none placeholder:text-content-disabled"
          aria-label="Search Memory"
        />
        {props.fetching && !props.loading ? (
          <DotMatrix
            rows={1}
            cols={4}
            activeDots={[0, 1, 2, 3]}
            dotSize={2}
            gap={2}
            animated
            aria-label="Updating results"
          />
        ) : null}
      </label>

      <div className="flex shrink-0 flex-wrap items-center gap-1.5 px-4 pt-3 pb-1">
        {(Object.keys(MEMORY_SOURCE_LABELS) as MemorySource[]).map((source) => {
          const active = selectedSources.has(source);
          return (
            <button
              key={source}
              type="button"
              onClick={() => props.onToggleSource(source)}
              aria-pressed={active}
              className={`h-6 rounded-full border px-2.5 ui-text-micro font-semibold transition-colors duration-150 ease-out motion-reduce:transition-none ${
                active
                  ? "border-[var(--color-accent)] bg-accent-10 text-[var(--color-accent)]"
                  : "border-transparent ui-color-muted hover:bg-surface-secondary"
              }`}
            >
              {MEMORY_SOURCE_LABELS[source]}
            </button>
          );
        })}
        <span className="mx-1 h-3.5 w-px bg-border-primary" aria-hidden />
        {MEMORY_DATE_WINDOWS.map((window) => (
          <button
            key={window.label}
            type="button"
            onClick={() => props.onDaysChange(window.days)}
            aria-pressed={props.days === window.days}
            className={`h-6 rounded-full px-2.5 ui-text-micro font-semibold transition-colors duration-150 ease-out motion-reduce:transition-none ${
              props.days === window.days
                ? "bg-accent-10 text-[var(--color-accent)]"
                : "ui-color-muted hover:bg-surface-secondary"
            }`}
          >
            {window.label}
          </button>
        ))}
        {props.advanced ? null : (
          <button
            type="button"
            onClick={props.onShowAdvanced}
            className="h-6 rounded-full px-2 ui-text-micro ui-color-disabled transition-colors hover:text-content-muted"
          >
            More filters…
          </button>
        )}
      </div>

      {props.advanced ? (
        <div className="grid shrink-0 grid-cols-2 gap-2 px-4 pt-2">
          <input
            value={props.appId}
            onChange={(event) => props.onAppIdChange(event.target.value)}
            placeholder="Filter by app"
            className="h-8 rounded-md border border-border-primary bg-surface-secondary px-2.5 ui-text-body-sm ui-color-primary outline-none placeholder:text-content-disabled focus:border-border-emphasis"
            aria-label="Filter Memory by app"
          />
          <input
            value={props.workflowId}
            onChange={(event) => props.onWorkflowIdChange(event.target.value)}
            placeholder="Filter by workflow"
            className="h-8 rounded-md border border-border-primary bg-surface-secondary px-2.5 ui-text-body-sm ui-color-primary outline-none placeholder:text-content-disabled focus:border-border-emphasis"
            aria-label="Filter Memory by workflow"
          />
        </div>
      ) : null}
    </>
  );
}
