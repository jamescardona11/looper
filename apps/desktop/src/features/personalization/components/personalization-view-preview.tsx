import { useState } from "react";
import { useLingui } from "@lingui/react/macro";
import type { Personality } from "../../../types";
import Shimmer from "../../../shared/ui/Shimmer";
import { useMountEffect } from "../../../shared/hooks/useMountEffect";
import * as personalizationApi from "../../../data/personalization";
import {
  stylePreviewKey,
  type StyleExample,
} from "./personalization-style-example";

export function StylePreview({
  personality,
  fallback,
}: {
  personality: Personality;
  fallback: StyleExample | null;
}) {
  const { t } = useLingui();
  const [sample, setSample] = useState("");
  const [result, setResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [running, setRunning] = useState(false);

  const runPreview = async () => {
    const trimmedSample = sample.trim();
    if (trimmedSample === "" || running) return;

    setRunning(true);
    setError(null);
    try {
      const transformed = await personalizationApi.previewPersonalityStyle(
        personality.id,
        trimmedSample,
      );
      setResult(transformed);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
    } finally {
      setRunning(false);
    }
  };

  return (
    <>
      <PreviewReset
        key={stylePreviewKey(personality, fallback)}
        fallback={fallback}
        resetError={() => setError(null)}
        resetResult={() => setResult(null)}
        resetSample={setSample}
      />
      <p className="mt-5 ui-text-label font-semibold ui-color-secondary">
        {t({ id: "personalization.try_style", message: "Try your style" })}
      </p>
      <div className="mt-2 max-w-xl overflow-hidden rounded-xl border border-border-primary">
        <div className="bg-surface-secondary px-4 py-3">
          <p className="ui-text-nano ui-text-uppercase-micro ui-color-disabled">
            {t({ id: "personalization.example.say", message: "You say" })}
          </p>
          <textarea
            value={sample}
            onChange={(event) => setSample(event.target.value)}
            onKeyDown={(event) => {
              if (event.key !== "Enter" || (!event.metaKey && !event.ctrlKey)) {
                return;
              }
              event.preventDefault();
              void runPreview();
            }}
            rows={2}
            placeholder={t({
              id: "personalization.try_style.placeholder",
              message: "Type or paste something you'd actually say…",
            })}
            className="mt-1 w-full resize-none bg-transparent ui-text-body-sm ui-color-secondary italic outline-none placeholder:text-content-disabled"
          />
          <div className="mt-1 flex items-center gap-2">
            <button
              type="button"
              onClick={() => void runPreview()}
              disabled={sample.trim() === "" || running}
              className="h-7 rounded-lg bg-[var(--color-accent)] px-3 ui-text-micro font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-40"
            >
              {running
                ? t({
                    id: "personalization.try_style.running",
                    message: "Writing…",
                  })
                : t({
                    id: "personalization.try_style.run",
                    message: "See it written",
                  })}
            </button>
            <span className="ui-text-micro ui-color-disabled">⌘↵</span>
          </div>
        </div>
        <div className="border-t border-dashed border-border-primary bg-surface-surface px-4 py-3">
          <p className="ui-text-nano ui-text-uppercase-micro text-[var(--color-accent)]">
            {t({
              id: "personalization.example.writes_with",
              message: `With ${personality.name}`,
            })}
          </p>
          {error ? (
            <p className="mt-1 ui-text-body-sm ui-color-error-soft">{error}</p>
          ) : running ? (
            <Shimmer className="mt-2 h-4 w-3/4" />
          ) : (
            <p className="mt-1 ui-text-body-sm ui-color-primary">
              {result ??
                fallback?.writes ??
                t({
                  id: "personalization.try_style.empty",
                  message: "Run it to see how this style writes.",
                })}
            </p>
          )}
        </div>
      </div>
    </>
  );
}

function PreviewReset({
  fallback,
  resetError,
  resetResult,
  resetSample,
}: {
  fallback: StyleExample | null;
  resetError: () => void;
  resetResult: () => void;
  resetSample: (sample: string) => void;
}) {
  useMountEffect(() => {
    resetSample(fallback ? fallback.say.replace(/^"|"$/g, "") : "");
    resetResult();
    resetError();
  });
  return null;
}
