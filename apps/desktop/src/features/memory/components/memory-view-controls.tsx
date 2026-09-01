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
  onResetFilters: () => void;
  advanced: boolean;
  onShowAdvanced: () => void;
  appId: string;
  onAppIdChange: (value: string) => void;
  workflowId: string;
  onWorkflowIdChange: (value: string) => void;
};

export function MemoryViewControls(props: MemoryViewControlsProps) {
  const selectedSources = new Set(props.sources);
  const everythingSelected = props.sources.length === 0 && props.days === null;
  const monthWindow = MEMORY_DATE_WINDOWS.find((window) => window.days === 30);
  return (
    <>
      <label className="flex shrink-0 items-center gap-3 bg-[var(--desktop-highlight)] px-[18px] py-[17px] focus-within:ring-2 focus-within:ring-inset focus-within:ring-[var(--color-accent-30)]">
        <MagnifyingGlass
          size={17}
          className="shrink-0 text-content-disabled"
          aria-hidden="true"
        />
        <input
          value={props.query}
          onChange={(event) => props.onQueryChange(event.target.value)}
          placeholder="Ask about a decision, person, or project…"
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
        <span className="rounded-md bg-[var(--color-bg-primary)] px-1.5 py-1 ui-text-micro font-semibold text-[var(--color-text-secondary)]">
          ⌘K
        </span>
      </label>

      <div className="flex shrink-0 flex-wrap items-center gap-[7px] border-b border-border-primary px-[15px] py-[11px]">
        <button
          type="button"
          onClick={props.onResetFilters}
          aria-pressed={everythingSelected}
          className={`h-[30px] rounded-[9px] px-2.5 ui-text-micro font-semibold transition-colors duration-150 ease-out motion-reduce:transition-none ${
            everythingSelected
              ? "bg-[var(--color-text-primary)] text-[var(--color-bg-primary)]"
              : "bg-[var(--color-bg-tertiary)] ui-color-muted hover:bg-surface-secondary"
          }`}
        >
          Everything
        </button>
        {(Object.keys(MEMORY_SOURCE_LABELS) as MemorySource[]).map((source) => {
          const active = selectedSources.has(source);
          return (
            <button
              key={source}
              type="button"
              onClick={() => props.onToggleSource(source)}
              aria-pressed={active}
              className={`h-[30px] rounded-[9px] px-2.5 ui-text-micro font-semibold transition-colors duration-150 ease-out motion-reduce:transition-none ${
                active
                  ? "bg-[var(--color-text-primary)] text-[var(--color-bg-primary)]"
                  : "bg-[var(--color-bg-tertiary)] ui-color-muted hover:bg-surface-secondary"
              }`}
            >
              {MEMORY_SOURCE_LABELS[source]}
            </button>
          );
        })}
        {monthWindow ? (
          <button
            type="button"
            onClick={() => props.onDaysChange(monthWindow.days)}
            aria-pressed={props.days === monthWindow.days}
            className={`h-[30px] rounded-[9px] px-2.5 ui-text-micro font-semibold transition-colors duration-150 ease-out motion-reduce:transition-none ${
              props.days === monthWindow.days
                ? "bg-[var(--color-text-primary)] text-[var(--color-bg-primary)]"
                : "bg-[var(--color-bg-tertiary)] ui-color-muted hover:bg-surface-secondary"
            }`}
          >
            This month
          </button>
        ) : null}
        {props.advanced ? null : (
          <button
            type="button"
            onClick={props.onShowAdvanced}
            className="h-[30px] rounded-[9px] px-2 ui-text-micro ui-color-disabled transition-colors hover:bg-surface-secondary hover:text-content-muted"
          >
            More filters…
          </button>
        )}
      </div>

      {props.advanced ? (
        <div className="grid shrink-0 grid-cols-2 gap-2 border-b border-border-primary px-4 py-3">
          <div className="col-span-2 flex flex-wrap gap-1.5">
            {MEMORY_DATE_WINDOWS.map((window) =>
              window.days === 30 ? null : (
                <button
                  key={window.label}
                  type="button"
                  onClick={() => props.onDaysChange(window.days)}
                  aria-pressed={props.days === window.days}
                  className={`h-[30px] rounded-[9px] px-2.5 ui-text-micro font-semibold transition-colors ${
                    props.days === window.days
                      ? "bg-[var(--color-text-primary)] text-[var(--color-bg-primary)]"
                      : "bg-[var(--color-bg-tertiary)] ui-color-muted hover:bg-surface-secondary"
                  }`}
                >
                  {window.label}
                </button>
              ),
            )}
          </div>
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
