import { getCurrentWindow } from "@tauri-apps/api/window";
import { useCallback, useEffect, useState } from "react";
import { cancelRecording } from "../../data/capture/audio";
import {
  cancelEditAction,
  cancelPendingInsertion,
  chooseEditAction,
  confirmPendingInsertion,
} from "../../data/capture/insertion";
import {
  EDIT_ACTIONS,
  type PillStatus,
  type TransformPreset,
} from "../../contracts";

type InteractionState = {
  status: PillStatus;
  dismiss: () => void;
  previewPending: boolean;
  previewEditing: boolean;
  previewDraft: string;
  expandedText: string;
  askResultPending: boolean;
  copyResultPending: boolean;
  insertedResultPending: boolean;
  actionSelectPending: boolean;
  selectedPreset: TransformPreset | undefined;
};

export function usePillInteractions(state: InteractionState) {
  const {
    status,
    dismiss,
    previewPending,
    previewEditing,
    previewDraft,
    expandedText,
    askResultPending,
    copyResultPending,
    insertedResultPending,
    actionSelectPending,
    selectedPreset,
  } = state;
  const [listeningSeconds, setListeningSeconds] = useState(0);

  useEffect(() => {
    if (status !== "listening") return;
    setListeningSeconds(0);
    const timer = window.setInterval(
      () => setListeningSeconds((seconds) => seconds + 1),
      1_000,
    );
    return () => window.clearInterval(timer);
  }, [status]);

  const cancelCurrentRecording = useCallback(async () => {
    try {
      await cancelRecording();
    } catch (error) {
      console.error("Failed to cancel recording:", error);
    }
  }, []);

  useEffect(() => {
    const dismissResult = (errorMessage: string) => {
      cancelPendingInsertion().catch((error) => {
        console.error(errorMessage, error);
      });
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && status === "error") {
        event.preventDefault();
        dismiss();
        getCurrentWindow()
          .hide()
          .catch((error) =>
            console.error("Failed to hide error window:", error),
          );
        return;
      }
      if (previewPending) {
        if (event.key === "Escape") {
          event.preventDefault();
          dismissResult("Failed to cancel pending insertion:");
        } else if (event.key === "Enter" && !event.shiftKey) {
          event.preventDefault();
          const text = previewEditing ? previewDraft : expandedText;
          confirmPendingInsertion(text).catch((error) => {
            console.error("Failed to confirm pending insertion:", error);
          });
        }
        return;
      }
      const readOnlyResult =
        askResultPending || copyResultPending || insertedResultPending;
      if (readOnlyResult) {
        if (
          event.key === "Escape" ||
          (event.key === "Enter" && !event.shiftKey)
        ) {
          event.preventDefault();
          dismissResult("Failed to dismiss ask result:");
        }
        return;
      }
      if (!actionSelectPending) return;
      if (event.key === "Escape") {
        event.preventDefault();
        cancelEditAction().catch((error) => {
          console.error("Failed to cancel edit action:", error);
        });
        return;
      }
      const selectedAction = EDIT_ACTIONS.find(
        ({ key }) => key === event.key,
      )?.action;
      if (selectedAction) {
        event.preventDefault();
        chooseEditAction(selectedAction, selectedPreset).catch((error) => {
          console.error("Failed to choose edit action:", error);
        });
      } else if (event.key === "Enter" && !event.shiftKey) {
        event.preventDefault();
        chooseEditAction("replace", selectedPreset).catch((error) => {
          console.error("Failed to choose edit action:", error);
        });
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [
    actionSelectPending,
    askResultPending,
    copyResultPending,
    dismiss,
    expandedText,
    insertedResultPending,
    previewDraft,
    previewEditing,
    previewPending,
    selectedPreset,
    status,
  ]);

  const minutes = String(Math.floor(listeningSeconds / 60)).padStart(2, "0");
  const seconds = String(listeningSeconds % 60).padStart(2, "0");
  return { listeningTimer: `${minutes}:${seconds}`, cancelCurrentRecording };
}
