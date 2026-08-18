import { useLingui } from "@lingui/react/macro";
import { AnimatePresence } from "framer-motion";

import {
  openMicrophoneSettings,
  openSystemAudioSettings,
  showLibraryToast,
} from "../../../data/library";
import type {
  LibraryImportOptions,
  MeetingStartOptions,
  SpeechModel,
  YoutubeImportMetadata,
} from "../../../types";
import LibraryImportModal from "./LibraryImportModal";
import LibraryYoutubeImportModal from "./LibraryYoutubeImportModal";
import MeetingStartModal from "./MeetingStartModal";
import { formatImportErrorMessage } from "./library-utils";
import { partitionImportPaths } from "./library-view-model";

type LibraryViewOverlaysProps = {
  youtubeOpen: boolean;
  onCloseYoutube: () => void;
  onCreateYoutube: (
    metadata: YoutubeImportMetadata,
    options: LibraryImportOptions,
  ) => Promise<unknown>;
  pendingImportPaths: string[] | null;
  onSetImportPaths: (paths: string[] | null) => void;
  onCreateFile: (
    path: string,
    options: LibraryImportOptions,
  ) => Promise<unknown>;
  installedModels: SpeechModel[];
  defaultSpeechModelKey?: string;
  defaultImportModelKey?: string;
  meetingOpen: boolean;
  meetingModels: SpeechModel[];
  liveMeetingModels: SpeechModel[];
  defaultMeetingModelKey?: string;
  meetingPending: boolean;
  meetingError: string | null;
  onCancelMeeting: () => void;
  onStartMeeting: (options: MeetingStartOptions) => Promise<unknown>;
};

export function LibraryViewOverlays(props: LibraryViewOverlaysProps) {
  const { t } = useLingui();

  const confirmImport = async (
    paths: string[],
    options: LibraryImportOptions,
  ) => {
    const { supported, unsupported } = partitionImportPaths(paths);
    if (unsupported.length > 0) {
      void showLibraryToast(
        "warning",
        t({
          id: "library.view.unsupported_files",
          message: `${unsupported.length} file(s) skipped due to unsupported format.`,
        }),
      ).catch(() => {});
    }

    for (const path of supported) {
      try {
        await props.onCreateFile(path, options);
      } catch (error) {
        console.error("Failed to import file:", error);
        void showLibraryToast(
          "error",
          formatImportErrorMessage(
            error instanceof Error ? error.message : String(error),
          ),
        ).catch(() => {});
      }
    }
    props.onSetImportPaths(null);
  };

  return (
    <AnimatePresence>
      {props.youtubeOpen ? (
        <LibraryYoutubeImportModal
          models={props.installedModels}
          defaultModelKey={props.defaultSpeechModelKey}
          onCancel={props.onCloseYoutube}
          onConfirm={async (metadata, options) => {
            await props.onCreateYoutube(metadata, options);
            props.onCloseYoutube();
          }}
        />
      ) : null}
      {props.pendingImportPaths !== null ? (
        <LibraryImportModal
          paths={props.pendingImportPaths}
          models={props.installedModels}
          defaultModelKey={props.defaultImportModelKey}
          onCancel={() => props.onSetImportPaths(null)}
          onConfirm={confirmImport}
        />
      ) : null}
      {props.meetingOpen ? (
        <MeetingStartModal
          models={props.meetingModels}
          liveModels={props.liveMeetingModels}
          defaultModelKey={props.defaultMeetingModelKey}
          isStarting={props.meetingPending}
          error={props.meetingError}
          onCancel={props.onCancelMeeting}
          onConfirm={async (options) => {
            try {
              await props.onStartMeeting(options);
            } catch {
              return;
            }
          }}
          onOpenSystemAudioSettings={() =>
            openSystemAudioSettings().catch((error) => {
              console.error("Failed to open system audio settings:", error);
            })
          }
          onOpenMicrophoneSettings={() =>
            openMicrophoneSettings().catch((error) => {
              console.error("Failed to open microphone settings:", error);
            })
          }
        />
      ) : null}
    </AnimatePresence>
  );
}
