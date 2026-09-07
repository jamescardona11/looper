import type { MemorySearchResult } from "../../../data/memory";
import { useLingui } from "@lingui/react/macro";
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
    <div className="min-h-0 flex-1 overflow-y-auto pb-2">
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
        <>
          <MemorySearchEvidence
            query={props.query}
            results={props.results}
            onOpenResult={props.onOpenResult}
          />
          {props.groups.map((group) => (
            <div key={group.key}>
              <p className="px-[15px] pt-[14px] pb-1 ui-text-uppercase-micro ui-color-muted">
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
                      props.resultIndexes.get(
                        `${result.source}:${result.id}`,
                      ) ?? 0,
                    )
                  }
                  onOpen={() => props.onOpenResult(result)}
                />
              ))}
            </div>
          ))}
        </>
      )}
    </div>
  );
}

function MemorySearchEvidence({
  query,
  results,
  onOpenResult,
}: Pick<MemoryViewResultsProps, "query" | "results" | "onOpenResult">) {
  const { t } = useLingui();
  if (!query.trim() || results.length === 0) return null;

  return (
    <section
      aria-label={t({
        id: "memory.evidence.label",
        message: "Local search evidence",
      })}
      className="m-[14px] rounded-[19px] bg-[var(--desktop-highlight)] p-5"
    >
      <p className="ui-text-body-sm font-semibold text-[var(--color-text-secondary)]">
        {t({ id: "memory.evidence.searched", message: "Searched" })}{" "}
        <b className="font-semibold text-[var(--color-text-primary)]">
          {results.length}{" "}
          {t({ id: "memory.evidence.sources", message: "local sources" })}
        </b>
        {query.trim() ? ` · “${query.trim()}”` : null}
      </p>
      <div className="mt-3 max-w-[700px] space-y-3">
        {results.slice(0, 3).map((result) => (
          <p
            key={`${result.source}:${result.id}`}
            className="ui-text-body-lg leading-relaxed text-[var(--color-text-primary)]"
          >
            {result.excerpt}{" "}
            <button
              type="button"
              onClick={() => onOpenResult(result)}
              aria-label={result.title}
              className="inline-flex max-w-full items-center gap-1 rounded-lg bg-[var(--color-bg-primary)] px-2 py-1 align-baseline ui-text-micro font-semibold text-[var(--color-accent)] transition-colors hover:bg-[var(--color-bg-tertiary)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-accent-50)]"
            >
              <span aria-hidden="true">▶</span>
              <span className="truncate">{result.title}</span>
            </button>
          </p>
        ))}
      </div>
      <p className="mt-[15px] flex items-center gap-2 border-t border-[var(--desktop-answer-divider)] pt-3 ui-text-micro text-[var(--color-text-secondary)]">
        <span
          className="h-1.5 w-1.5 rounded-full bg-[var(--color-accent)]"
          aria-hidden="true"
        />
        {t({
          id: "memory.evidence.local",
          message: "Searched on this Mac. None of it left the machine.",
        })}
      </p>
    </section>
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
