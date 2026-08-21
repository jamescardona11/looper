// @vitest-environment jsdom

import { setupI18n } from "@lingui/core";
import { I18nProvider } from "@lingui/react";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, test, vi } from "vitest";
import type { ImportPreview, ImportSelections } from "../../../../contracts";
import { ImportStepCategories } from "../import-step-categories";
import { ImportStepFeedback } from "../import-step-feedback";
import { ImportStepFooter } from "../import-step-footer";
import { ImportStepSource } from "../import-step-source";

const messages = {
  "import.app_picker.aria": "SOURCE-PICKER-DISTINCT",
  "import.apply.failed": "APPLY-FAILED-DISTINCT",
  "import.cat.auto_launch": "AUTO-LAUNCH-DISTINCT",
  "import.cat.auto_launch.off": "OFF-DISTINCT",
  "import.cat.dictionary": "DICTIONARY-DISTINCT",
  "import.cat.dictionary.detail": "WORDS-DISTINCT",
  "import.cat.history": "HISTORY-DISTINCT",
  "import.cat.history.detail": "TRANSCRIPTS-DISTINCT",
  "import.cat.language": "LANGUAGE-DISTINCT",
  "import.cat.model": "MODEL-DISTINCT",
  "import.cat.personalities": "PERSONALITIES-DISTINCT",
  "import.cat.personalities.detail": "SAVED-DISTINCT",
  "import.cat.replacements": "REPLACEMENTS-DISTINCT",
  "import.cat.replacements.detail": "RULES-DISTINCT",
  "import.cat.shortcut": "SHORTCUT-DISTINCT",
  "import.cta": "IMPORT-DISTINCT",
  "import.empty": "EMPTY-DISTINCT",
  "import.error": "READ-ERROR-DISTINCT",
  "import.importing": "IMPORTING-DISTINCT",
  "import.model.unrecognized": "MODEL-WARNING-DISTINCT",
  "import.skip": "SKIP-DISTINCT",
  "import.subtitle": "SUBTITLE-DISTINCT",
  "import.title": "TITLE-DISTINCT",
};

const i18n = setupI18n();
i18n.loadAndActivate({ locale: "en", messages });
const translated = (content: React.ReactNode) => (
  <I18nProvider i18n={i18n}>{content}</I18nProvider>
);

const preview: ImportPreview = {
  id: "source-a",
  name: "Source A",
  dictionaryCount: 2,
  replacementsCount: 1,
  personalitiesCount: 1,
  transcriptCount: 3,
  shortcut: "Cmd+Shift+Space",
  language: "Spanish",
  autoLaunch: false,
  modelSource: "known",
  modelKey: "parakeet",
  modelRecognized: true,
};

const selections: ImportSelections = {
  dictionary: true,
  replacements: true,
  personalities: true,
  shortcut: true,
  language: true,
  autoLaunch: true,
  model: true,
  history: true,
};

afterEach(cleanup);

describe("import step translation contract", () => {
  test("renders source and every category from explicit catalog ids", () => {
    render(
      translated(
        <>
          <ImportStepSource
            sources={[
              { id: "source-a", name: "Source A" },
              { id: "source-b", name: "Source B" },
            ]}
            selectedSourceId="source-a"
            onSelectSource={vi.fn()}
          />
          <ImportStepCategories
            loading={false}
            failed={false}
            preview={preview}
            categories={[
              "dictionary",
              "replacements",
              "personalities",
              "history",
              "shortcut",
              "language",
              "autoLaunch",
              "model",
            ]}
            selections={selections}
            onToggle={vi.fn()}
          />
        </>,
      ),
    );
    for (const label of [
      "TITLE-DISTINCT",
      "SUBTITLE-DISTINCT",
      "DICTIONARY-DISTINCT",
      "REPLACEMENTS-DISTINCT",
      "PERSONALITIES-DISTINCT",
      "HISTORY-DISTINCT",
      "SHORTCUT-DISTINCT",
      "LANGUAGE-DISTINCT",
      "AUTO-LAUNCH-DISTINCT",
      "MODEL-DISTINCT",
      "OFF-DISTINCT",
    ]) {
      expect(screen.getByText(label)).toBeTruthy();
    }
    expect(
      screen.getByRole("radiogroup", { name: "SOURCE-PICKER-DISTINCT" }),
    ).toBeTruthy();
  });

  test("translates footer, feedback, empty, and read-error states distinctly", () => {
    const { rerender } = render(
      translated(
        <>
          <ImportStepFooter
            pending={false}
            importEnabled
            onImport={vi.fn()}
            onSkip={vi.fn()}
          />
          <ImportStepFeedback needsModelChoice applyFailed />
          <ImportStepCategories
            loading={false}
            failed={false}
            preview={undefined}
            categories={[]}
            selections={selections}
            onToggle={vi.fn()}
          />
        </>,
      ),
    );
    for (const label of [
      "IMPORT-DISTINCT",
      "SKIP-DISTINCT",
      "MODEL-WARNING-DISTINCT",
      "APPLY-FAILED-DISTINCT",
      "EMPTY-DISTINCT",
    ]) {
      expect(screen.getByText(label)).toBeTruthy();
    }
    rerender(
      translated(
        <ImportStepCategories
          loading={false}
          failed
          preview={undefined}
          categories={[]}
          selections={selections}
          onToggle={vi.fn()}
        />,
      ),
    );
    expect(screen.getByText("READ-ERROR-DISTINCT")).toBeTruthy();
  });
});
