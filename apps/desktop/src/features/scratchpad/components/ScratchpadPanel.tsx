import { useEffect, useState } from "react";
import { X } from "@phosphor-icons/react";

const STORAGE_KEY = "looper.desktop.scratchpad";

function readScratchpad(): string {
  try {
    return window.localStorage.getItem(STORAGE_KEY) ?? "";
  } catch {
    return "";
  }
}

export default function ScratchpadPanel({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const [draft, setDraft] = useState(readScratchpad);

  useEffect(() => {
    try {
      window.localStorage.setItem(STORAGE_KEY, draft);
    } catch {
      // La edición sigue disponible incluso si el WebView no expone storage.
    }
  }, [draft]);

  if (!open) return null;

  return (
    <aside
      aria-label="Scratchpad"
      className="fixed bottom-6 right-6 top-[72px] z-50 flex w-[360px] flex-col rounded-[22px] border border-border-secondary bg-[var(--color-bg-primary)] p-4 shadow-xl"
    >
      <header className="flex items-center justify-between border-b border-border-primary pb-3">
        <div>
          <strong className="ui-text-title ui-color-primary">Scratchpad</strong>
          <span className="ml-2 ui-text-micro ui-color-muted">
            <span aria-hidden="true" className="mr-1 inline-block h-1.5 w-1.5 rounded-full bg-[var(--color-accent)]" />
            Local
          </span>
        </div>
        <button
          aria-label="Close Scratchpad"
          className="flex h-7 w-7 items-center justify-center rounded-lg ui-color-muted hover:bg-surface-elevated hover:ui-color-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent-30)]"
          onClick={onClose}
          type="button"
        >
          <X aria-hidden="true" size={15} />
        </button>
      </header>
      <textarea
        aria-label="Quick note"
        className="mt-4 min-h-0 flex-1 resize-none bg-transparent ui-text-body ui-color-primary outline-none placeholder:text-content-disabled"
        onChange={(event) => setDraft(event.target.value)}
        placeholder="Say or type a thought. Decide where it goes later."
        value={draft}
      />
      <footer className="border-t border-border-primary pt-3 ui-text-micro ui-color-muted">
        Saved locally
      </footer>
    </aside>
  );
}
