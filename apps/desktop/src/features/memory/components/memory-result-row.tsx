import { useState } from "react";
import { useLingui } from "@lingui/react/macro";
import { Check, Copy } from "@phosphor-icons/react";

import type { MemorySearchResult } from "../../../data/memory";
import { useCopyToClipboard } from "../../../shared/hooks/useCopyToClipboard";

type MemoryResultRowProps = {
  result: MemorySearchResult;
  query: string;
  selected: boolean;
  onSelect: () => void;
  onOpen: () => void;
};

export function MemoryResultRow(props: MemoryResultRowProps) {
  const { t } = useLingui();
  const [showRaw, setShowRaw] = useState(false);
  const { copied, copy } = useCopyToClipboard(1_200);
  const text =
    showRaw && props.result.raw_text
      ? props.result.raw_text
      : props.result.final_text;
  return (
    <article
      aria-current={props.selected ? "true" : undefined}
      onMouseEnter={props.onSelect}
      className={`group mx-[15px] grid grid-cols-[minmax(0,1fr)_auto] gap-3 border-b border-border-primary px-0 py-3 transition-colors ${
        props.selected
          ? "bg-[var(--color-bg-primary)]"
          : "hover:bg-[var(--color-bg-primary)]"
      }`}
    >
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
          <h3 className="truncate ui-text-body-sm font-medium ui-color-primary">
            {props.result.title}
          </h3>
          <span className="ui-text-micro ui-color-disabled">
            {new Date(props.result.occurred_at_ms).toLocaleString()}
          </span>
          {props.result.app_id ? (
            <span className="ui-text-micro ui-color-muted">
              {props.result.app_id}
            </span>
          ) : null}
          {props.result.workflow_name ? (
            <span className="ui-text-micro ui-color-muted">
              {props.result.workflow_name}
            </span>
          ) : null}
        </div>
        <p className="mt-1 line-clamp-2 whitespace-pre-wrap ui-text-body-sm ui-color-secondary">
          <HighlightedText
            text={
              showRaw && props.result.raw_text
                ? props.result.raw_text
                : props.result.excerpt
            }
            query={props.query}
          />
        </p>
      </div>

      <div className="flex shrink-0 items-center gap-1">
        {props.result.raw_text ? (
          <div
            className="flex h-7 rounded-md border border-border-primary p-0.5"
            aria-label={t({
              id: "memory.result.version",
              message: "Text version",
            })}
          >
            {(
              [
                {
                  id: "final" as const,
                  label: t({
                    id: "memory.result.final",
                    message: "Final",
                  }),
                },
                {
                  id: "raw" as const,
                  label: t({ id: "memory.result.raw", message: "Raw" }),
                },
              ] as const
            ).map(({ id, label }) => {
              const active = id === "raw" ? showRaw : !showRaw;
              return (
                <button
                  key={id}
                  type="button"
                  onClick={() => setShowRaw(id === "raw")}
                  aria-pressed={active}
                  className={`rounded px-1.5 ui-text-micro ${
                    active
                      ? "bg-content-primary text-surface-primary"
                      : "ui-color-muted"
                  }`}
                >
                  {label}
                </button>
              );
            })}
          </div>
        ) : null}
        <button
          type="button"
          onClick={() => copy(text)}
          className="ui-button-ghost h-7 w-7"
          aria-label="Copy Memory result"
        >
          {copied ? <Check size={14} /> : <Copy size={14} />}
        </button>
        <button
          type="button"
          onClick={props.onOpen}
          className="h-7 rounded-lg px-2.5 ui-text-micro font-semibold text-[var(--color-text-secondary)] transition-colors hover:bg-surface-secondary hover:text-[var(--color-text-primary)]"
          aria-label={`Open ${props.result.title}`}
        >
          {t({ id: "memory.result.open", message: "Open" })}
        </button>
      </div>
    </article>
  );
}

function HighlightedText({ text, query }: { text: string; query: string }) {
  const rawTokens = query
    .trim()
    .split(/\s+/)
    .filter((token) => token.length > 1);
  if (rawTokens.length === 0) return text;

  const matcher = new RegExp(
    `(${rawTokens
      .map((token) => token.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
      .join("|")})`,
    "gi",
  );
  return text.split(matcher).map((part, index) =>
    rawTokens.some((token) => token.toLowerCase() === part.toLowerCase()) ? (
      <mark
        key={`${part}-${index}`}
        className="rounded-sm bg-accent-10 px-0.5 text-inherit"
      >
        {part}
      </mark>
    ) : (
      part
    ),
  );
}
