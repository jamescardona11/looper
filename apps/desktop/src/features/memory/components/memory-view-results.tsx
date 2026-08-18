import type { MemorySearchResult } from "../../../data/memory";
import DotMatrix from "../../../shared/ui/DotMatrix";
import Shimmer from "../../../shared/ui/Shimmer";
import { MemoryResultRow } from "./memory-result-row";
import {
  MEMORY_SUGGESTIONS,
  type MemoryResultGroup,
} from "./memory-view-model";

type MemoryViewResultsProps = {
  loading: boolean;
  error: unknown;
  results: MemorySearchResult[];
  groups: MemoryResultGroup[];
  orderedResults: MemorySearchResult[];
  activeResultIndex: number;
  resultIndexes: Map<string, number>;
  query: string;
  highlightQuery: string;
  onQueryChange: (value: string) => void;
  onActiveResultChange: (index: number) => void;
  onOpenResult: (result: MemorySearchResult) => void;
};

export function MemoryViewResults(props: MemoryViewResultsProps) {
  return (
    <div className="min-h-0 flex-1 overflow-y-auto px-2 pt-1 pb-2">
      {props.loading ? (
        <div aria-hidden="true" className="space-y-1 px-2 pt-2">
          {[0, 1, 2].map((row) => (
            <div key={row} className="rounded-lg p-3">
              <Shimmer className="h-3 w-32" />
              <Shimmer className="mt-2.5 h-3.5 w-3/4" />
            </div>
          ))}
        </div>
      ) : props.error ? (
        <div className="flex h-full min-h-44 items-center justify-center">
          <MemoryState message="Memory search could not read local storage." />
        </div>
      ) : props.results.length === 0 ? (
        <div className="flex h-full min-h-44 flex-col items-center justify-center gap-4 text-center">
          <MemoryState
            message={
              props.query.trim()
                ? "No matching dictations, recordings or meetings."
                : "Search everything you dictated, recorded or discussed."
            }
          />
          {!props.query.trim() ? (
            <div className="flex flex-wrap items-center justify-center gap-1.5">
              {MEMORY_SUGGESTIONS.map((suggestion) => (
                <button
                  key={suggestion}
                  type="button"
                  onClick={() => props.onQueryChange(suggestion)}
                  className="h-7 rounded-full border border-border-primary bg-surface-surface px-3 ui-text-micro ui-color-secondary transition-colors hover:border-border-secondary hover:bg-surface-secondary"
                >
                  {suggestion}
                </button>
              ))}
            </div>
          ) : null}
        </div>
      ) : (
        props.groups.map((group) => (
          <div key={group.key}>
            <p className="px-3 pt-3 pb-1 ui-text-uppercase-micro ui-color-disabled">
              {group.label}
            </p>
            {group.results.map((result) => (
              <MemoryResultRow
                key={`${result.source}:${result.id}`}
                result={result}
                query={props.highlightQuery}
                selected={
                  props.orderedResults[props.activeResultIndex]?.id ===
                    result.id &&
                  props.orderedResults[props.activeResultIndex]?.source ===
                    result.source
                }
                onSelect={() =>
                  props.onActiveResultChange(
                    props.resultIndexes.get(`${result.source}:${result.id}`) ??
                      0,
                  )
                }
                onOpen={() => props.onOpenResult(result)}
              />
            ))}
          </div>
        ))
      )}
    </div>
  );
}

function MemoryState({ message }: { message: string }) {
  return (
    <div className="flex flex-col items-center justify-center text-center">
      <DotMatrix
        rows={3}
        cols={3}
        activeDots={[0, 2, 4, 6, 8]}
        dotSize={3}
        gap={4}
        color="var(--color-text-disabled)"
        className="mb-3 opacity-50"
        aria-hidden="true"
      />
      <p className="max-w-sm ui-text-body-sm ui-color-muted">{message}</p>
    </div>
  );
}
