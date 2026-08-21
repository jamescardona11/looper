import { useLingui } from "@lingui/react/macro";
import { useQueryClient } from "@tanstack/react-query";
import { useCallback, useId, useMemo, useState } from "react";

import {
  acceptSuggestedCorrection,
  dismissSuggestedCorrection,
} from "../../../data/corrections";
import {
  setLocalDictionary,
  setLocalReplacements,
} from "../../../data/dictionary-sync";
import { setLocalSnippets } from "../../../data/snippets-sync";
import { useShiftHeld } from "../../../shared/hooks/useShiftHeld";
import {
  hasModelCapability,
  MODEL_CAPABILITY_DICTIONARY,
} from "../../../shared/lib/modelCapabilities";
import WorkspacePage from "../../../shared/ui/WorkspacePage";
import type { Replacement, UserSnippet } from "../../../types";
import { useModelCatalog } from "../../settings/models/models-queries";
import { settingsKeys, useSettings } from "../../settings/preferences/queries";
import {
  setDictionaryEntriesCache,
  setDictionaryReplacementsCache,
  setDictionarySnippetsCache,
  setSuggestedCorrectionsCache,
  useDictionaryUsage,
  useReplacements,
  useSnippets,
  useSuggestedCorrections,
} from "../queries";
import { DictionaryEntryList } from "./dictionary-entry-list";
import { DictionaryReplacementsSection } from "./DictionaryReplacementsSection";
import { DictionarySnippetsSection } from "./DictionarySnippetsSection";
import { DictionaryViewHeader } from "./dictionary-view-header";
import {
  addDictionaryEntry,
  addDictionaryReplacement,
  addDictionarySnippet,
  DICTIONARY_ENTRY_LIMIT,
  editDictionaryEntry,
  editDictionaryReplacement,
  editDictionarySnippet,
  filterDictionaryEntries,
  readableDictionaryError,
  removeDictionaryItem,
  sectionIsVisible,
} from "./dictionary-view-model";
import {
  DICTIONARY_ACTION_GRADIENT,
  DICTIONARY_DELETE_BUTTON,
  DICTIONARY_DELETE_BUTTON_ACTIVE,
  DICTIONARY_EDIT_ROW,
  DICTIONARY_FADE_ITEM_THRESHOLD,
  DICTIONARY_PANEL_BODY,
  DICTIONARY_PANEL_FADE,
  dictionaryItemRowClass,
} from "./dictionary-view-presentation";
import { DictionaryVocabularyControls } from "./dictionary-vocabulary-controls";
import { useQueuedPersist } from "./useQueuedPersist";

export type DictionarySection = "all" | "vocabulary" | "rules" | "snippets";

type DictionaryViewProps = {
  isActive?: boolean;
  section?: DictionarySection;
  embedded?: boolean;
};

export default function DictionaryView({
  isActive = true,
  section = "all",
  embedded = false,
}: DictionaryViewProps) {
  const { t } = useLingui();
  const queryClient = useQueryClient();
  const shiftHeld = useShiftHeld(isActive);
  const warningTooltipId = useId();

  const settingsQuery = useSettings(undefined, isActive);
  const modelsQuery = useModelCatalog(isActive);
  const replacementsQuery = useReplacements(isActive);
  const snippetsQuery = useSnippets(isActive);
  const suggestionsQuery = useSuggestedCorrections(isActive);
  const usageQuery = useDictionaryUsage(isActive);

  const [entryDraft, setEntryDraft] = useState("");
  const [entryEdit, setEntryEdit] = useState({
    index: null as number | null,
    value: "",
  });
  const [replacementDraft, setReplacementDraft] = useState({
    from: "",
    to: "",
  });
  const [replacementEdit, setReplacementEdit] = useState({
    index: null as number | null,
    from: "",
    to: "",
  });
  const [snippetDraft, setSnippetDraft] = useState({
    trigger: "",
    expansion: "",
  });
  const [snippetEdit, setSnippetEdit] = useState({
    index: null as number | null,
    trigger: "",
    expansion: "",
  });
  const [error, setError] = useState<string | null>(null);

  const settings = settingsQuery.data ?? null;
  const entries = settings?.dictionary ?? [];
  const models = modelsQuery.data ?? [];
  const replacements = replacementsQuery.data ?? [];
  const snippets = snippetsQuery.data ?? [];
  const suggestions = suggestionsQuery.data ?? [];
  const usage = usageQuery.data ?? {};

  const entriesWriter = useQueuedPersist({
    value: entries,
    persist: setLocalDictionary,
    setError,
    setValue: (value) => setDictionaryEntriesCache(queryClient, value),
  });
  const replacementsWriter = useQueuedPersist({
    value: replacements,
    persist: setLocalReplacements,
    setError,
    setValue: (value) => setDictionaryReplacementsCache(queryClient, value),
  });
  const snippetsWriter = useQueuedPersist({
    value: snippets,
    persist: setLocalSnippets,
    setError,
    setValue: (value) => setDictionarySnippetsCache(queryClient, value),
  });

  const searchQuery = entryDraft.trim().toLowerCase();
  const filteredEntries = useMemo(
    () => filterDictionaryEntries(entries, searchQuery, embedded),
    [embedded, entries, searchQuery],
  );
  const isSearching = searchQuery.length > 0;
  const isDictionaryFull = entries.length >= DICTIONARY_ENTRY_LIMIT;

  const persistEntries = useCallback(
    async (value: string[]) => {
      setEntryEdit({ index: null, value: "" });
      setEntryDraft("");
      await entriesWriter.persistNext(value);
    },
    [entriesWriter.persistNext],
  );
  const persistReplacements = useCallback(
    async (value: Replacement[]) => {
      setReplacementEdit({ index: null, from: "", to: "" });
      setReplacementDraft({ from: "", to: "" });
      await replacementsWriter.persistNext(value);
    },
    [replacementsWriter.persistNext],
  );
  const persistSnippets = useCallback(
    async (value: UserSnippet[]) => {
      setSnippetEdit({ index: null, trigger: "", expansion: "" });
      setSnippetDraft({ trigger: "", expansion: "" });
      await snippetsWriter.persistNext(value);
    },
    [snippetsWriter.persistNext],
  );

  const addEntry = async () => {
    const next = addDictionaryEntry(
      entriesWriter.currentRef.current,
      entryDraft,
    );
    if (next) await persistEntries(next);
  };
  const commitEntryEdit = async () => {
    if (entryEdit.index === null) return;
    await persistEntries(
      editDictionaryEntry(
        entriesWriter.currentRef.current,
        entryEdit.index,
        entryEdit.value,
      ),
    );
  };
  const deleteEntry = async (index: number) => {
    await persistEntries(
      removeDictionaryItem(entriesWriter.currentRef.current, index),
    );
  };
  const startEntryEdit = (index: number) => {
    setEntryEdit({
      index,
      value: entriesWriter.currentRef.current[index] ?? "",
    });
  };

  const addReplacement = async () => {
    const next = addDictionaryReplacement(
      replacementsWriter.currentRef.current,
      replacementDraft.from,
      replacementDraft.to,
    );
    if (next) await persistReplacements(next);
  };
  const commitReplacementEdit = async () => {
    if (replacementEdit.index === null) return;
    await persistReplacements(
      editDictionaryReplacement(
        replacementsWriter.currentRef.current,
        replacementEdit.index,
        replacementEdit.from,
        replacementEdit.to,
      ),
    );
  };
  const deleteReplacement = async (index: number) => {
    await persistReplacements(
      removeDictionaryItem(replacementsWriter.currentRef.current, index),
    );
  };
  const startReplacementEdit = (index: number) => {
    const replacement = replacementsWriter.currentRef.current[index];
    setReplacementEdit({
      index,
      from: replacement?.from ?? "",
      to: replacement?.to ?? "",
    });
  };

  const addSnippet = async () => {
    const next = addDictionarySnippet(
      snippetsWriter.currentRef.current,
      snippetDraft.trigger,
      snippetDraft.expansion,
    );
    if (next) await persistSnippets(next);
  };
  const commitSnippetEdit = async () => {
    if (snippetEdit.index === null) return;
    await persistSnippets(
      editDictionarySnippet(
        snippetsWriter.currentRef.current,
        snippetEdit.index,
        snippetEdit.trigger,
        snippetEdit.expansion,
      ),
    );
  };
  const deleteSnippet = async (index: number) => {
    await persistSnippets(
      removeDictionaryItem(snippetsWriter.currentRef.current, index),
    );
  };
  const startSnippetEdit = (index: number) => {
    const snippet = snippetsWriter.currentRef.current[index];
    setSnippetEdit({
      index,
      trigger: snippet?.trigger ?? "",
      expansion: snippet?.expansion ?? "",
    });
  };

  const updateSuggestion = async (
    operation: typeof acceptSuggestedCorrection,
    from: string,
    to: string,
    refreshDictionary: boolean,
  ) => {
    try {
      const remaining = await operation(from, to);
      setSuggestedCorrectionsCache(queryClient, remaining);
      if (refreshDictionary) {
        await queryClient.invalidateQueries({
          queryKey: settingsKeys.detail(),
        });
      }
    } catch (cause) {
      setError(readableDictionaryError(cause));
    }
  };

  const currentModel = models.find(
    (model) => model.key === settings?.local_model,
  );
  const showWarning = Boolean(
    settings?.transcription_mode === "local" &&
    currentModel &&
    !hasModelCapability(currentModel, MODEL_CAPABILITY_DICTIONARY),
  );
  const vocabularyVisible = sectionIsVisible(section, "vocabulary");
  const rulesVisible = sectionIsVisible(section, "rules");
  const snippetsVisible = sectionIsVisible(section, "snippets");
  const itemRowClassName = dictionaryItemRowClass(embedded);

  const editHintLabel = t({
    id: "dictionary.edit_hint",
    message: "Press Enter to save · Esc to cancel",
  });
  const dictionaryMetaLabel =
    isSearching && entries.length > 0
      ? t({
          id: "dictionary.search_matches",
          message: `${filteredEntries.length} of ${entries.length} matches`,
        })
      : t({
          id: "dictionary.entry_count.capacity",
          message: `${entries.length} of ${DICTIONARY_ENTRY_LIMIT}`,
        });
  const dictionaryHintLabel =
    entryEdit.index !== null
      ? editHintLabel
      : isDictionaryFull
        ? t({ id: "dictionary.full_hint", message: "Dictionary is full" })
        : isSearching && entries.length > 0
          ? t({
              id: "dictionary.press_enter_to_add_match",
              message: "Press Enter to add this word",
            })
          : t({
              id: "dictionary.press_enter_to_add",
              message: "Press Enter to add",
            });
  const replacementCountLabel =
    replacements.length === 1
      ? t({
          id: "dictionary.replacements.count.single",
          message: "1 replacement",
        })
      : t({
          id: "dictionary.replacements.count.multiple",
          message: `${replacements.length} replacements`,
        });
  const snippetCountLabel =
    snippets.length === 1
      ? t({ id: "dictionary.snippets.count.single", message: "1 snippet" })
      : t({
          id: "dictionary.snippets.count.multiple",
          message: `${snippets.length} snippets`,
        });
  const bootstrapError =
    settingsQuery.error ??
    modelsQuery.error ??
    replacementsQuery.error ??
    snippetsQuery.error;
  const resolvedError =
    error ?? (bootstrapError ? readableDictionaryError(bootstrapError) : null);
  const loading =
    isActive &&
    (settingsQuery.isLoading ||
      modelsQuery.isLoading ||
      replacementsQuery.isLoading ||
      snippetsQuery.isLoading);

  return (
    <WorkspacePage
      className={`min-w-0 px-0 text-left ${embedded ? "" : "max-w-7xl mx-auto"}`}
      header={
        embedded ? null : (
          <DictionaryViewHeader
            embedded={false}
            showWarning={showWarning}
            warningTooltipId={warningTooltipId}
            modelLabel={currentModel?.label ?? settings?.local_model}
          />
        )
      }
    >
      <div
        className={`grid w-full min-w-0 grid-cols-1 gap-0 ${
          vocabularyVisible && rulesVisible
            ? "md:grid-cols-[minmax(0,0.95fr)_minmax(0,1.05fr)]"
            : ""
        }`}
      >
        <div
          className={`min-w-0 pb-6 md:pr-6 md:pb-0 lg:pr-8 ${
            vocabularyVisible ? "" : "hidden"
          }`}
        >
          <DictionaryVocabularyControls
            embedded={embedded}
            suggestions={suggestions}
            itemRowClassName={itemRowClassName}
            deleteButtonClassName={DICTIONARY_DELETE_BUTTON}
            onAcceptSuggestion={(from, to) =>
              void updateSuggestion(acceptSuggestedCorrection, from, to, true)
            }
            onDismissSuggestion={(from, to) =>
              void updateSuggestion(dismissSuggestedCorrection, from, to, false)
            }
            value={entryDraft}
            onValueChange={setEntryDraft}
            onAdd={() => void addEntry()}
            placeholder={
              isDictionaryFull
                ? t({
                    id: "dictionary.search_only",
                    message: "Search dictionary...",
                  })
                : t({
                    id: "dictionary.search_or_add",
                    message: "Search or add a word...",
                  })
            }
            searching={isSearching}
            hasEntries={entries.length > 0}
            metaLabel={dictionaryMetaLabel}
            hintLabel={dictionaryHintLabel}
          />
          <DictionaryEntryList
            entries={entries}
            filteredEntries={filteredEntries}
            loading={loading}
            pending={entriesWriter.pending}
            searching={isSearching}
            dictionaryFull={isDictionaryFull}
            newEntry={entryDraft}
            embedded={embedded}
            editingIndex={entryEdit.index}
            editingValue={entryEdit.value}
            onEditingValueChange={(value) =>
              setEntryEdit((edit) => ({ ...edit, value }))
            }
            onEditCommit={() => void commitEntryEdit()}
            onEditCancel={() => setEntryEdit({ index: null, value: "" })}
            shiftHeld={shiftHeld}
            onDelete={(index) => void deleteEntry(index)}
            onStartEditing={startEntryEdit}
            usage={usage}
            panelBodyClassName={DICTIONARY_PANEL_BODY}
            panelBodyFadeClassName={DICTIONARY_PANEL_FADE}
            fadeItemThreshold={DICTIONARY_FADE_ITEM_THRESHOLD}
            itemRowClassName={itemRowClassName}
            editRowClassName={DICTIONARY_EDIT_ROW}
            actionGradientStyle={DICTIONARY_ACTION_GRADIENT}
            deleteButtonClassName={DICTIONARY_DELETE_BUTTON}
            deleteButtonActiveClassName={DICTIONARY_DELETE_BUTTON_ACTIVE}
          />
        </div>
        <DictionaryReplacementsSection
          visible={rulesVisible}
          vocabularyVisible={vocabularyVisible}
          embedded={embedded}
          newFrom={replacementDraft.from}
          setNewFrom={(from) =>
            setReplacementDraft((draft) => ({ ...draft, from }))
          }
          newTo={replacementDraft.to}
          setNewTo={(to) => setReplacementDraft((draft) => ({ ...draft, to }))}
          handleAddReplacement={() => void addReplacement()}
          replacementCountLabel={replacementCountLabel}
          replacementHintLabel={
            replacementEdit.index !== null
              ? editHintLabel
              : t({
                  id: "dictionary.replacements.press_enter_to_add",
                  message: "Press Enter in either field to add",
                })
          }
          replacementsPending={replacementsWriter.pending}
          panelBodyClassName={DICTIONARY_PANEL_BODY}
          replacements={replacements}
          fadeItemThreshold={DICTIONARY_FADE_ITEM_THRESHOLD}
          panelBodyFadeClassName={DICTIONARY_PANEL_FADE}
          loading={loading}
          editingReplacementIndex={replacementEdit.index}
          editRowClassName={DICTIONARY_EDIT_ROW}
          editingFrom={replacementEdit.from}
          setEditingFrom={(from) =>
            setReplacementEdit((edit) => ({ ...edit, from }))
          }
          editingTo={replacementEdit.to}
          setEditingTo={(to) => setReplacementEdit((edit) => ({ ...edit, to }))}
          cancelReplacementEdit={() =>
            setReplacementEdit({ index: null, from: "", to: "" })
          }
          handleEditReplacementCommit={() => void commitReplacementEdit()}
          itemRowClassName={itemRowClassName}
          shiftHeld={shiftHeld}
          handleDeleteReplacement={(index) => void deleteReplacement(index)}
          startEditingReplacement={startReplacementEdit}
          actionGradientStyle={DICTIONARY_ACTION_GRADIENT}
          deleteButtonActiveClassName={DICTIONARY_DELETE_BUTTON_ACTIVE}
          deleteButtonClassName={DICTIONARY_DELETE_BUTTON}
        />
      </div>
      <DictionarySnippetsSection
        visible={snippetsVisible}
        section={section}
        embedded={embedded}
        newTrigger={snippetDraft.trigger}
        setNewTrigger={(trigger) =>
          setSnippetDraft((draft) => ({ ...draft, trigger }))
        }
        newExpansion={snippetDraft.expansion}
        setNewExpansion={(expansion) =>
          setSnippetDraft((draft) => ({ ...draft, expansion }))
        }
        handleAddSnippet={() => void addSnippet()}
        snippetCountLabel={snippetCountLabel}
        snippetHintLabel={
          snippetEdit.index !== null
            ? editHintLabel
            : t({
                id: "dictionary.snippets.press_enter_to_add",
                message: "Press Enter in either field to add",
              })
        }
        snippetsPending={snippetsWriter.pending}
        snippets={snippets}
        loading={loading}
        fadeItemThreshold={DICTIONARY_FADE_ITEM_THRESHOLD}
        panelBodyFadeClassName={DICTIONARY_PANEL_FADE}
        editingSnippetIndex={snippetEdit.index}
        editRowClassName={DICTIONARY_EDIT_ROW}
        editingTrigger={snippetEdit.trigger}
        setEditingTrigger={(trigger) =>
          setSnippetEdit((edit) => ({ ...edit, trigger }))
        }
        editingExpansion={snippetEdit.expansion}
        setEditingExpansion={(expansion) =>
          setSnippetEdit((edit) => ({ ...edit, expansion }))
        }
        cancelSnippetEdit={() =>
          setSnippetEdit({ index: null, trigger: "", expansion: "" })
        }
        handleEditSnippetCommit={() => void commitSnippetEdit()}
        itemRowClassName={itemRowClassName}
        shiftHeld={shiftHeld}
        handleDeleteSnippet={(index) => void deleteSnippet(index)}
        startEditingSnippet={startSnippetEdit}
        actionGradientStyle={DICTIONARY_ACTION_GRADIENT}
        deleteButtonActiveClassName={DICTIONARY_DELETE_BUTTON_ACTIVE}
        deleteButtonClassName={DICTIONARY_DELETE_BUTTON}
      />
      {resolvedError ? (
        <div className="mt-3 border-t border-border-primary pt-3 ui-text-body-sm ui-color-error-soft">
          {resolvedError}
        </div>
      ) : null}
    </WorkspacePage>
  );
}
