import {
  useMutation as useImportMutation,
  useQueryClient,
} from "@tanstack/react-query";
import { useState } from "react";
import { applyImport as importSelectedData } from "../../../data/imports";
import type {
  DetectedApp as ImportSource,
  ImportResult as AppliedImport,
  ImportSelection as ImportCategory,
} from "../../../contracts";
import {
  OnboardingStep as StepFrame,
  type StepMotionProps as ImportMotion,
} from "../../onboarding/steps/shared";
import { settingsKeys as settingQueryKeys } from "../../settings/preferences/queries";
import { transcriptionKeys as transcriptQueryKeys } from "../../transcriptions/queries";
import { useImportPreview as useSelectedImportPreview } from "../queries";
import { ImportStepCategories } from "./import-step-categories";
import { ImportStepFeedback } from "./import-step-feedback";
import { ImportStepFooter } from "./import-step-footer";
import {
  availableImportCategories,
  DEFAULT_IMPORT_SELECTIONS,
  enabledImportCategoryCount,
  importPreviewIsPending,
  needsModelSelection,
  previewForImportSource,
  selectionsForSource,
  toggleImportCategory,
  type ImportSelectionState,
} from "./import-step-policy";
import { ImportStepSource } from "./import-step-source";

interface ImportStepProps {
  stepMotionProps: ImportMotion;
  apps: ImportSource[];
  onApplied: (result: AppliedImport) => void;
  onNext: () => void;
}

export function ImportStep(props: ImportStepProps) {
  const queryCache = useQueryClient();
  const [selectedSourceId, setSelectedSourceId] = useState<string | null>(
    props.apps[0]?.id ?? null,
  );
  const [selectionState, setSelectionState] = useState<ImportSelectionState>(
    () => ({
      sourceId: selectedSourceId,
      values: DEFAULT_IMPORT_SELECTIONS,
    }),
  );
  const previewRequest = useSelectedImportPreview(selectedSourceId);
  const matchingPreview = previewForImportSource(
    previewRequest.data,
    selectedSourceId,
  );
  const previewPending = importPreviewIsPending({
    loading: previewRequest.isLoading,
    fetching: previewRequest.isFetching,
    matchingPreview,
  });
  const categories = availableImportCategories(matchingPreview);
  const selections = selectionsForSource(selectionState, selectedSourceId);
  const selectedCount = enabledImportCategoryCount(categories, selections);
  const hasCategories = categories.length > 0;

  const importRequest = useImportMutation({
    mutationFn: () =>
      importSelectedData(selectedSourceId as string, selections),
    onSuccess: (result) => {
      void queryCache.invalidateQueries({ queryKey: settingQueryKeys.all });
      if (result.transcriptsAdded > 0) {
        void queryCache.invalidateQueries({
          queryKey: transcriptQueryKeys.all,
        });
      }
      props.onApplied(result);
    },
  });

  const toggleCategory = (category: ImportCategory) => {
    setSelectionState((current) =>
      toggleImportCategory(current, selectedSourceId, category),
    );
  };
  const selectSource = (sourceId: string) => {
    setSelectedSourceId(sourceId);
    setSelectionState({
      sourceId,
      values: DEFAULT_IMPORT_SELECTIONS,
    });
  };

  return (
    <StepFrame
      stepKey="import"
      motionProps={props.stepMotionProps}
      widthClass="max-w-lg"
      footer={
        <ImportStepFooter
          pending={importRequest.isPending}
          importEnabled={hasCategories && selectedCount > 0}
          onImport={() => importRequest.mutate()}
          onSkip={props.onNext}
        />
      }
    >
      <ImportStepSource
        sources={props.apps}
        selectedSourceId={selectedSourceId}
        onSelectSource={selectSource}
      />
      <ImportStepCategories
        loading={previewPending}
        failed={previewRequest.isError}
        preview={matchingPreview}
        categories={categories}
        selections={selections}
        onToggle={toggleCategory}
      />
      <ImportStepFeedback
        needsModelChoice={needsModelSelection(matchingPreview)}
        applyFailed={importRequest.isError}
      />
    </StepFrame>
  );
}
