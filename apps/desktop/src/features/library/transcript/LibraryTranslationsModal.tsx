import { useLingui } from "@lingui/react/macro";
import { useEffect, useMemo, useState, type MouseEvent } from "react";
import { motion } from "framer-motion";
import {
  Check,
  CircleNotch,
  Copy,
  SpeakerHigh,
  SpeakerSlash,
  Trash,
  Translate,
  X,
} from "@phosphor-icons/react";
import { Dropdown, type DropdownOption } from "../../../shared/ui/Dropdown";
import { useCopyToClipboard } from "../../../shared/hooks/useCopyToClipboard";
import {
  deleteLibraryTranslation,
  getLibraryTranslations,
  translateLibraryItem,
} from "../../../data/library";
import type { LibraryTranslation } from "../../../contracts";
import { useSpeechPlayback } from "../../../shared/hooks/useSpeechPlayback";

const TRANSLATION_LANGUAGES = [
  "Arabic",
  "Chinese (Simplified)",
  "Chinese (Traditional)",
  "Dutch",
  "English",
  "French",
  "German",
  "Hindi",
  "Indonesian",
  "Italian",
  "Japanese",
  "Korean",
  "Polish",
  "Portuguese",
  "Russian",
  "Spanish",
  "Turkish",
  "Ukrainian",
  "Vietnamese",
] as const;

type LibraryTranslationsModalProps = {
  itemId: string;
  itemName: string;
  onClose: () => void;
};

const LibraryTranslationsModal = ({
  itemId,
  itemName,
  onClose,
}: LibraryTranslationsModalProps) => {
  const { t } = useLingui();
  const [translations, setTranslations] = useState<LibraryTranslation[]>([]);
  const [selectedLanguage, setSelectedLanguage] = useState("Spanish");
  const [activeLanguage, setActiveLanguage] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isTranslating, setIsTranslating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { copied, copy } = useCopyToClipboard(1400);

  useEffect(() => {
    let cancelled = false;
    getLibraryTranslations(itemId)
      .then((items) => {
        if (cancelled) return;
        setTranslations(items);
        setActiveLanguage((current) => current ?? items[0]?.language ?? null);
      })
      .catch((err) => {
        if (!cancelled)
          setError(err instanceof Error ? err.message : String(err));
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [itemId]);

  const languageOptions = useMemo<DropdownOption<string>[]>(
    () =>
      TRANSLATION_LANGUAGES.map((language) => ({
        value: language,
        label: language,
      })),
    [],
  );
  const activeTranslation =
    translations.find(
      (translation) => translation.language === activeLanguage,
    ) ?? null;
  const speech = useSpeechPlayback(
    activeTranslation?.text ?? "",
    activeTranslation?.language,
  );

  const handleTranslate = async () => {
    setIsTranslating(true);
    setError(null);
    try {
      const translation = await translateLibraryItem(itemId, selectedLanguage);
      setTranslations((current) => [
        ...current.filter((item) => item.language !== translation.language),
        translation,
      ]);
      setActiveLanguage(translation.language);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsTranslating(false);
    }
  };

  const handleDelete = async () => {
    if (!activeTranslation) return;
    setError(null);
    try {
      await deleteLibraryTranslation(itemId, activeTranslation.language);
      const remaining = translations.filter(
        (item) => item.language !== activeTranslation.language,
      );
      setTranslations(remaining);
      setActiveLanguage(remaining[0]?.language ?? null);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 px-6 backdrop-blur-xs"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby="library-translations-title"
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.97, y: 10 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.97, y: 10 }}
        className="flex max-h-[82vh] w-[680px] max-w-[94vw] flex-col rounded-2xl border border-border-primary bg-surface-tertiary ui-shadow-modal-deep"
        onClick={(event: MouseEvent<HTMLDivElement>) => event.stopPropagation()}
      >
        <div className="flex items-start justify-between border-b border-border-primary px-5 py-4">
          <div className="flex min-w-0 items-start gap-3">
            <Translate
              size={18}
              className="mt-0.5 shrink-0 text-content-muted"
            />
            <div className="min-w-0">
              <h2
                id="library-translations-title"
                className="ui-text-body-lg font-semibold text-content-primary"
              >
                {t({
                  id: "library.translation.title",
                  message: "Translate transcript",
                })}
              </h2>
              <p className="truncate ui-text-meta text-content-muted">
                {itemName}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label={t({ id: "library.import.close", message: "Close" })}
            className="flex h-7 w-7 items-center justify-center rounded-md text-content-muted hover:bg-surface-elevated hover:text-content-primary"
          >
            <X size={14} />
          </button>
        </div>

        <div className="flex items-end gap-2 border-b border-border-primary px-5 py-3">
          <div className="min-w-0 flex-1">
            <label className="ui-text-label text-content-muted">
              {t({
                id: "library.translation.target",
                message: "Target language",
              })}
            </label>
            <div className="mt-1">
              <Dropdown
                value={selectedLanguage}
                onChange={setSelectedLanguage}
                options={languageOptions}
                searchable
              />
            </div>
          </div>
          <button
            type="button"
            onClick={handleTranslate}
            disabled={isTranslating}
            className="inline-flex items-center gap-1.5 rounded-lg bg-content-primary px-3 py-2 ui-text-body-sm text-surface-primary hover:opacity-90 disabled:opacity-50"
          >
            {isTranslating && (
              <CircleNotch size={13} className="animate-spin" />
            )}
            {translations.some((item) => item.language === selectedLanguage)
              ? t({
                  id: "library.translation.regenerate",
                  message: "Regenerate",
                })
              : t({ id: "library.translation.create", message: "Translate" })}
          </button>
        </div>

        {translations.length > 0 && (
          <div className="flex gap-1 overflow-x-auto border-b border-border-primary px-5 py-2 custom-scrollbar">
            {translations
              .slice()
              .sort((left, right) =>
                left.language.localeCompare(right.language),
              )
              .map((translation) => (
                <button
                  key={translation.language}
                  type="button"
                  onClick={() => setActiveLanguage(translation.language)}
                  className={[
                    "shrink-0 rounded-md px-2.5 py-1 ui-text-meta transition-colors",
                    activeLanguage === translation.language
                      ? "bg-surface-elevated text-content-primary"
                      : "text-content-muted hover:bg-surface-secondary hover:text-content-primary",
                  ].join(" ")}
                >
                  {translation.language}
                </button>
              ))}
          </div>
        )}

        <div className="min-h-52 flex-1 overflow-y-auto px-5 py-4 custom-scrollbar">
          {isLoading ? (
            <div className="flex h-40 items-center justify-center">
              <CircleNotch
                size={18}
                className="animate-spin text-content-muted"
              />
            </div>
          ) : activeTranslation ? (
            <div>
              <div className="mb-3 flex items-center justify-between gap-3">
                <span className="ui-text-meta text-content-disabled">
                  {activeTranslation.model}
                </span>
                <div className="flex items-center gap-1">
                  {speech.supported && (
                    <button
                      type="button"
                      onClick={speech.isSpeaking ? speech.stop : speech.speak}
                      className="inline-flex items-center gap-1 rounded-md px-2 py-1 ui-text-meta text-content-muted hover:bg-surface-elevated hover:text-content-primary"
                    >
                      {speech.isSpeaking ? (
                        <SpeakerSlash size={11} />
                      ) : (
                        <SpeakerHigh size={11} />
                      )}
                      {speech.isSpeaking
                        ? t({ id: "read_aloud.stop_short", message: "Stop" })
                        : t({ id: "read_aloud.start", message: "Read aloud" })}
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => copy(activeTranslation.text)}
                    className="inline-flex items-center gap-1 rounded-md px-2 py-1 ui-text-meta text-content-muted hover:bg-surface-elevated hover:text-content-primary"
                  >
                    {copied ? <Check size={11} /> : <Copy size={11} />}
                    {copied
                      ? t({
                          id: "library.modal.copy.copied",
                          message: "Copied",
                        })
                      : t({ id: "library.modal.copy", message: "Copy" })}
                  </button>
                  <button
                    type="button"
                    onClick={handleDelete}
                    aria-label={t({
                      id: "library.translation.delete",
                      message: "Delete translation",
                    })}
                    className="rounded-md p-1.5 text-content-muted hover:bg-[var(--color-error)]/10 hover:text-red-400"
                  >
                    <Trash size={11} />
                  </button>
                </div>
              </div>
              <div className="whitespace-pre-wrap select-text ui-text-body leading-relaxed text-content-secondary">
                {activeTranslation.text}
              </div>
            </div>
          ) : (
            <div className="flex h-40 items-center justify-center text-center ui-text-body-sm text-content-disabled">
              {t({
                id: "library.translation.empty",
                message:
                  "Choose a language to create a separate translation. The original transcript stays unchanged.",
              })}
            </div>
          )}
          {error && (
            <div
              role="alert"
              className="mt-3 rounded-lg border border-[var(--color-error)]/30 bg-[var(--color-error)]/10 px-3 py-2 ui-text-body-sm ui-color-error-tint"
            >
              {error}
            </div>
          )}
        </div>
      </motion.div>
    </motion.div>
  );
};

export default LibraryTranslationsModal;
