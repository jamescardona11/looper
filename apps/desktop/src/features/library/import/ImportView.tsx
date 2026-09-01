import { open } from "@tauri-apps/plugin-dialog";
import { ArrowLeft, FileAudio, FolderOpen, Trash, X } from "@phosphor-icons/react";

import { SUPPORTED_EXTENSIONS, uniquePaths } from "../shared/library-utils";

type ImportViewProps = {
  onBack: () => void;
  onReviewImport: () => void;
  onUpdatePaths: (paths: string[] | null) => void;
  selectedPaths: string[] | null;
};

const fileName = (path: string) => path.split(/[\\/]/).at(-1) ?? path;

const fileFormat = (path: string) => {
  const extension = fileName(path).split(".").at(-1);
  return extension ? extension.toUpperCase() : "Audio";
};

/** Full import route. Model and retention choices remain in the existing import sheet. */
export default function ImportView({
  onBack,
  onReviewImport,
  onUpdatePaths,
  selectedPaths,
}: ImportViewProps) {
  const chooseFiles = async () => {
    const selection = await open({
      multiple: true,
      filters: [
        {
          name: "Audio & Video",
          extensions: SUPPORTED_EXTENSIONS,
        },
      ],
    });
    if (!selection) return;
    const paths = Array.isArray(selection) ? selection : [selection];
    onUpdatePaths(uniquePaths([...(selectedPaths ?? []), ...paths]));
  };

  const queuedPaths = selectedPaths ?? [];

  return (
    <section className="flex h-full min-h-0 w-full flex-col pt-8">
      <header className="shrink-0">
        <button
          className="-ml-2 flex h-8 items-center gap-1 rounded-lg px-2 ui-text-body-sm ui-color-muted transition-colors hover:bg-surface-elevated hover:ui-color-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent-30)]"
          onClick={onBack}
          type="button"
        >
          <ArrowLeft aria-hidden="true" size={14} />
          Notes
        </button>
        <p className="mt-5 ui-text-uppercase-micro ui-color-accent">Import</p>
        <h1 className="mt-2 ui-text-display ui-color-primary">
          Bring in what you already recorded.
        </h1>
      </header>

      <div className="mt-5">
        <button
          className="flex w-full flex-col items-center rounded-[14px] border border-dashed border-border-secondary bg-surface-surface px-5 py-[34px] text-center transition-colors hover:border-border-hover hover:bg-surface-elevated focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent-30)]"
          onClick={() => void chooseFiles()}
          type="button"
        >
          <span className="flex h-[38px] w-[38px] items-center justify-center rounded-[11px] bg-accent-10 ui-color-accent">
            <FolderOpen aria-hidden="true" size={18} />
          </span>
          <strong className="mt-3 ui-text-title ui-color-primary">
            Drop audio or video here
          </strong>
          <span className="mt-2 max-w-sm ui-text-body-sm ui-color-muted">
            M4A, MP3, WAV, MP4 and MOV. Files are transcribed locally and are
            never uploaded.
          </span>
          <span className="mt-4 rounded-lg bg-[var(--color-accent)] px-4 py-2 ui-text-body-sm font-semibold text-white">
            Choose files
          </span>
        </button>
      </div>

      {queuedPaths.length > 0 ? (
        <section className="mt-5" aria-labelledby="import-queue-title">
          <div className="flex items-end justify-between border-b border-border-primary pb-3">
            <div>
              <p className="ui-text-uppercase-micro ui-color-accent">Queue</p>
              <h2 id="import-queue-title" className="mt-1 ui-text-title ui-color-primary">
                {queuedPaths.length === 1 ? "1 file" : `${queuedPaths.length} files`}
              </h2>
            </div>
            <button
              type="button"
              onClick={() => onUpdatePaths(null)}
              className="flex h-8 items-center gap-1.5 rounded-lg px-2 ui-text-body-sm ui-color-muted transition-colors hover:bg-surface-elevated hover:text-[var(--color-error)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent-30)]"
            >
              <Trash aria-hidden="true" size={14} />
              Clear
            </button>
          </div>
          <div className="border-t border-border-primary">
            {queuedPaths.map((path) => (
              <div
                key={path}
                className="grid min-h-14 grid-cols-[32px_minmax(0,1fr)_116px_auto] items-center gap-3 border-b border-border-primary py-3"
              >
                <span className="grid h-8 w-8 shrink-0 place-items-center rounded-[10px] bg-accent-10 ui-color-accent">
                  <FileAudio aria-hidden="true" size={15} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate ui-text-body-sm-strong ui-color-primary">
                    {fileName(path)}
                  </span>
                  <span className="mt-0.5 block ui-text-micro ui-color-muted">
                    {fileFormat(path)} · Ready to review
                  </span>
                </span>
                <span className="ui-text-micro text-content-muted">
                  Ready to review
                </span>
                <button
                  type="button"
                  aria-label={`Remove ${fileName(path)}`}
                  onClick={() => {
                    const remaining = queuedPaths.filter((item) => item !== path);
                    onUpdatePaths(remaining.length > 0 ? remaining : null);
                  }}
                  className="flex h-8 shrink-0 items-center rounded-lg px-2 ui-text-body-sm text-content-muted transition-colors hover:bg-surface-elevated hover:text-[var(--color-error)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent-30)]"
                >
                  <X aria-hidden="true" size={13} />
                  Remove
                </button>
              </div>
            ))}
          </div>
          <button
            type="button"
            onClick={onReviewImport}
            className="mt-5 inline-flex h-10 items-center rounded-lg bg-[var(--color-accent)] px-4 ui-text-body-sm font-semibold text-white transition-opacity hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent-30)]"
          >
            Review import
          </button>
        </section>
      ) : null}

      <section className="mt-5 rounded-[14px] border border-border-primary bg-surface-surface px-5 py-4">
        <h2 className="ui-text-body-sm-strong ui-color-primary">
          What happens to the original
        </h2>
        <p className="mt-1.5 max-w-xl ui-text-body-sm ui-color-muted">
          Imports keep their source file so you can always return to the
          audio.
        </p>
        <div className="mt-4 divide-y divide-border-primary border-t border-border-primary">
          <div className="flex items-center justify-between gap-4 py-3 ui-text-body-sm">
            <span className="ui-color-primary">Keep the original file</span>
            <span className="font-medium text-[var(--color-toggle-on)]">On</span>
          </div>
          <div className="flex items-center justify-between gap-4 py-3 ui-text-body-sm">
            <span className="ui-color-primary">Speaker detection</span>
            <span className="ui-color-muted">Choose during review</span>
          </div>
        </div>
      </section>
    </section>
  );
}
