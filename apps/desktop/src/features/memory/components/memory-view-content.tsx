import { useMemo, useState, type KeyboardEvent } from "react";
import { useLingui } from "@lingui/react/macro";

import type { MemorySearchResult, MemorySource } from "../../../data/memory";
import { useDebouncedValue } from "../../../shared/hooks/useDebouncedValue";
import { useMountEffect } from "../../../shared/hooks/useMountEffect";
import { useMemorySearch } from "../queries";
import { MemoryViewControls } from "./memory-view-controls";
import {
  groupMemoryResults,
  indexMemoryResults,
  toggleMemorySource,
} from "./memory-view-model";
import { MemoryViewResults } from "./memory-view-results";

type MemoryViewProps = {
  isActive: boolean;
  onOpenResult: (result: MemorySearchResult) => void;
  prefillQuery?: string | null;
  onPrefillConsumed?: () => void;
};

export default function MemoryView({
  isActive,
  onOpenResult,
  prefillQuery = null,
  onPrefillConsumed,
}: MemoryViewProps) {
  const { t } = useLingui();
  const [query, setQuery] = useState("");
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [sources, setSources] = useState<MemorySource[]>([]);
  const [days, setDays] = useState<number | null>(null);
  const [appId, setAppId] = useState("");
  const [workflowId, setWorkflowId] = useState("");
  const [activeResultIndex, setActiveResultIndex] = useState(0);
  const debouncedQuery = useDebouncedValue(query, 180);
  const debouncedAppId = useDebouncedValue(appId, 180);
  const debouncedWorkflowId = useDebouncedValue(workflowId, 180);
  const filter = useMemo(
    () => ({
      query: debouncedQuery,
      sources,
      since_ms: days === null ? null : Date.now() - days * 24 * 60 * 60 * 1_000,
      app_id: debouncedAppId.trim() || null,
      workflow_id: debouncedWorkflowId.trim() || null,
      limit: 50,
    }),
    [debouncedAppId, debouncedQuery, debouncedWorkflowId, days, sources],
  );
  const {
    data: results = [],
    isLoading,
    isFetching,
    error,
  } = useMemorySearch(filter, isActive);
  const searching = debouncedQuery.trim().length > 0;
  const groups = useMemo(
    () => groupMemoryResults(results, searching),
    [results, searching],
  );
  const orderedResults = useMemo(
    () => groups.flatMap((group) => group.results),
    [groups],
  );
  const resultIndexes = useMemo(
    () => indexMemoryResults(orderedResults),
    [orderedResults],
  );
  const safeActiveResultIndex = Math.min(
    activeResultIndex,
    Math.max(orderedResults.length - 1, 0),
  );

  const handlePaletteKeyDown = (event: KeyboardEvent) => {
    const target = event.target;
    if (
      target instanceof HTMLElement &&
      target !== event.currentTarget &&
      target.tagName !== "INPUT"
    ) {
      return;
    }
    if (orderedResults.length === 0) return;
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      const direction = event.key === "ArrowDown" ? 1 : -1;
      setActiveResultIndex(
        (current) =>
          (current + direction + orderedResults.length) % orderedResults.length,
      );
    }
    if (event.key === "Enter") {
      event.preventDefault();
      const activeResult = orderedResults[safeActiveResultIndex];
      if (activeResult) onOpenResult(activeResult);
    }
  };

  return (
    <div className="flex h-full min-h-0 flex-col items-center overflow-hidden px-6 pt-12 pb-6">
      {prefillQuery === null ? null : (
        <MemoryQueryPrefill
          key={prefillQuery}
          query={prefillQuery}
          onApply={setQuery}
          onConsumed={onPrefillConsumed}
        />
      )}
      <section
        aria-label="Memory search"
        onKeyDown={handlePaletteKeyDown}
        className="flex min-h-0 w-full max-w-[640px] flex-col overflow-hidden rounded-2xl border border-border-primary bg-surface-surface shadow-md"
      >
        <MemoryViewControls
          query={query}
          onQueryChange={setQuery}
          loading={isLoading}
          fetching={isFetching}
          sources={sources}
          onToggleSource={(source) =>
            setSources((current) => toggleMemorySource(current, source))
          }
          days={days}
          onDaysChange={setDays}
          advanced={showAdvanced}
          onShowAdvanced={() => setShowAdvanced(true)}
          appId={appId}
          onAppIdChange={setAppId}
          workflowId={workflowId}
          onWorkflowIdChange={setWorkflowId}
        />
        <MemoryViewResults
          loading={isLoading}
          error={error}
          results={results}
          groups={groups}
          orderedResults={orderedResults}
          activeResultIndex={safeActiveResultIndex}
          resultIndexes={resultIndexes}
          query={query}
          highlightQuery={debouncedQuery}
          onQueryChange={setQuery}
          onActiveResultChange={setActiveResultIndex}
          onOpenResult={onOpenResult}
        />
        <div className="flex shrink-0 items-center gap-4 border-t border-border-primary bg-surface-primary/40 px-4 py-2 ui-text-micro ui-color-muted">
          <span>
            {t({ id: "memory.hint.navigate", message: "↑↓ navigate" })}
          </span>
          <span>{t({ id: "memory.hint.open", message: "↵ open" })}</span>
          <span className="flex-1" />
          <span>
            {t({
              id: "memory.privacy.local_search",
              message: "Search stays on this device",
            })}
          </span>
        </div>
      </section>
    </div>
  );
}

function MemoryQueryPrefill({
  query,
  onApply,
  onConsumed,
}: {
  query: string;
  onApply: (query: string) => void;
  onConsumed?: () => void;
}) {
  useMountEffect(() => {
    onApply(query);
    onConsumed?.();
  });
  return null;
}
