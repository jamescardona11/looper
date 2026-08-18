import { plural as pluralMessage } from "@lingui/core/macro";
import { useLingui as useImportCategoryTranslations } from "@lingui/react/macro";
import { Check as SelectedIcon } from "@phosphor-icons/react";
import type {
  ImportPreview,
  ImportSelection,
  ImportSelections,
} from "../../../types";
import { formatShortcutForDisplay } from "../../../shared/lib/shortcuts";

const PREVIEW_SLOT_IDS = [
  "one",
  "two",
  "three",
  "four",
  "five",
  "six",
  "seven",
];
const CATEGORY_ROW_CLASS = "flex items-center gap-3 py-2.5";
const DIVIDED_ROWS_CLASS = "divide-y divide-border-primary/40";
const RESERVED_ROWS_CLASS = `${DIVIDED_ROWS_CLASS} invisible pointer-events-none`;
const DECK_CLASS = "relative w-full text-left";
const DECK_LAYERS_CLASS = "absolute inset-0";
const RESULT_ERROR_CLASS =
  "py-4 text-center ui-text-label text-content-muted text-balance";
const RESULT_EMPTY_CLASS = "py-4 text-center ui-text-label text-content-muted";
const SKELETON_MARK_CLASS =
  "h-5 w-5 shrink-0 rounded-full bg-surface-overlay animate-pulse";
const SKELETON_TEXT_CLASS =
  "h-3 flex-1 max-w-[9rem] rounded bg-surface-overlay animate-pulse";

const categoryMarkClass = (selected: boolean): string =>
  [
    "flex h-5 w-5 shrink-0 items-center justify-center rounded-full transition-colors",
    selected
      ? "bg-content-primary text-surface-secondary"
      : "border border-border-secondary group-hover:border-border-hover",
  ].join(" ");

const categoryLabelClass = (selected: boolean): string =>
  [
    "ui-text-label font-medium transition-colors",
    selected ? "text-content-primary" : "text-content-muted",
  ].join(" ");

const previewLayerClass = (visible: boolean): string =>
  [
    "absolute inset-x-0 top-0 transition-opacity duration-200 ease-out",
    visible ? "opacity-100" : "pointer-events-none opacity-0",
  ].join(" ");

type CategoryPresentation = { label: string; detail: string };

function ImportCategoryRow(props: {
  category: ImportSelection;
  presentation: CategoryPresentation;
  selected: boolean;
  onToggle: (category: ImportSelection) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => props.onToggle(props.category)}
      className={`group w-full ${CATEGORY_ROW_CLASS}`}
      aria-pressed={props.selected}
    >
      <span className={categoryMarkClass(props.selected)}>
        <SelectedIcon
          size={12}
          strokeWidth={3}
          className={props.selected ? "opacity-100" : "opacity-0"}
        />
      </span>
      <span className="flex min-w-0 flex-1 items-baseline justify-between gap-3">
        <span className={categoryLabelClass(props.selected)}>
          {props.presentation.label}
        </span>
        <span className="ui-text-meta text-content-muted truncate text-right">
          {props.presentation.detail}
        </span>
      </span>
    </button>
  );
}

function ImportCategoryRows(props: {
  categories: ImportSelection[];
  preview: ImportPreview;
  selections: ImportSelections;
  onToggle: (category: ImportSelection) => void;
}) {
  const { t } = useImportCategoryTranslations();
  const presentations: Record<ImportSelection, CategoryPresentation> = {
    dictionary: {
      label: t({ id: "import.cat.dictionary", message: "Dictionary" }),
      detail: t({
        id: "import.cat.dictionary.detail",
        message: pluralMessage(props.preview.dictionaryCount, {
          one: "# word",
          other: "# words",
        }),
      }),
    },
    replacements: {
      label: t({
        id: "import.cat.replacements",
        message: "Text replacements",
      }),
      detail: t({
        id: "import.cat.replacements.detail",
        message: pluralMessage(props.preview.replacementsCount, {
          one: "# rule",
          other: "# rules",
        }),
      }),
    },
    personalities: {
      label: t({ id: "import.cat.personalities", message: "Personalities" }),
      detail: t({
        id: "import.cat.personalities.detail",
        message: pluralMessage(props.preview.personalitiesCount, {
          one: "# saved",
          other: "# saved",
        }),
      }),
    },
    history: {
      label: t({ id: "import.cat.history", message: "Transcript history" }),
      detail: t({
        id: "import.cat.history.detail",
        message: pluralMessage(props.preview.transcriptCount, {
          one: "# transcript",
          other: "# transcripts",
        }),
      }),
    },
    shortcut: {
      label: t({ id: "import.cat.shortcut", message: "Keyboard shortcut" }),
      detail: formatShortcutForDisplay(props.preview.shortcut ?? ""),
    },
    language: {
      label: t({ id: "import.cat.language", message: "Language" }),
      detail: props.preview.language ?? "",
    },
    autoLaunch: {
      label: t({ id: "import.cat.auto_launch", message: "Launch at login" }),
      detail: props.preview.autoLaunch
        ? t({ id: "import.cat.auto_launch.on", message: "On" })
        : t({ id: "import.cat.auto_launch.off", message: "Off" }),
    },
    model: {
      label: t({ id: "import.cat.model", message: "Transcription model" }),
      detail: props.preview.modelKey ?? "",
    },
  };
  return (
    <div className={DIVIDED_ROWS_CLASS}>
      {props.categories.map((category) => (
        <ImportCategoryRow
          key={category}
          category={category}
          presentation={presentations[category]}
          selected={props.selections[category]}
          onToggle={props.onToggle}
        />
      ))}
    </div>
  );
}

function PreviewSkeleton() {
  return (
    <div className={DIVIDED_ROWS_CLASS}>
      {PREVIEW_SLOT_IDS.map((slot) => (
        <div key={slot} className={CATEGORY_ROW_CLASS}>
          <div className={SKELETON_MARK_CLASS} />
          <div className={SKELETON_TEXT_CLASS} />
        </div>
      ))}
    </div>
  );
}

function ReservedPreviewHeight() {
  return (
    <div aria-hidden className={RESERVED_ROWS_CLASS}>
      {PREVIEW_SLOT_IDS.map((slot) => (
        <div key={slot} className={CATEGORY_ROW_CLASS}>
          <span className="h-5 w-5 shrink-0" />
          <span className="ui-text-label">&nbsp;</span>
        </div>
      ))}
    </div>
  );
}

function PreviewResult(props: {
  failed: boolean;
  preview: ImportPreview | undefined;
  categories: ImportSelection[];
  selections: ImportSelections;
  onToggle: (category: ImportSelection) => void;
}) {
  const { t } = useImportCategoryTranslations();
  if (props.failed) {
    return (
      <p className={RESULT_ERROR_CLASS}>
        {t({
          id: "import.error",
          message:
            "We couldn't read this app's data. You can skip and set things up manually.",
        })}
      </p>
    );
  }
  if (!props.preview || props.categories.length === 0) {
    return (
      <p className={RESULT_EMPTY_CLASS}>
        {t({
          id: "import.empty",
          message: "Nothing to bring over from this app.",
        })}
      </p>
    );
  }
  return (
    <ImportCategoryRows
      categories={props.categories}
      preview={props.preview}
      selections={props.selections}
      onToggle={props.onToggle}
    />
  );
}

export function ImportStepCategories(props: {
  loading: boolean;
  failed: boolean;
  preview: ImportPreview | undefined;
  categories: ImportSelection[];
  selections: ImportSelections;
  onToggle: (category: ImportSelection) => void;
}) {
  return (
    <div className={DECK_CLASS}>
      <ReservedPreviewHeight />
      <div className={DECK_LAYERS_CLASS}>
        <div
          className={previewLayerClass(props.loading)}
          aria-hidden={!props.loading}
        >
          <PreviewSkeleton />
        </div>
        <div
          className={previewLayerClass(!props.loading)}
          aria-hidden={props.loading}
        >
          <PreviewResult {...props} />
        </div>
      </div>
    </div>
  );
}
