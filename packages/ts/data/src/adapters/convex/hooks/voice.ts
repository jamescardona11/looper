import { api } from "@looper/backend/convex/_generated/api";
import { useAction, useMutation, useQuery } from "convex/react";
import type {
  StreamProvider,
  StreamSttSession,
  SttProvider,
  TranscribeResult,
  TranscriptionItem,
} from "../../../types";
import { type UploadSourceInput, useUploadToStorage } from "../upload-protocol";

type TranscribeInput = UploadSourceInput & {
  provider: SttProvider;
  type: string;
  durationMs?: number;
  retainAudio?: boolean;
};

export function useTranscribe(): {
  transcribe: (input: TranscribeInput) => Promise<TranscribeResult>;
  history: TranscriptionItem[];
  isAvailable: boolean;
  isLoading: boolean;
} {
  const transcribeAction = useAction(api.stt.transcribe.transcribe);
  const generateUploadUrlMutation = useMutation(api.stt.transcribe.generateUploadUrl);
  const historyRaw = useQuery(api.stt.transcribe.list, { limit: 20 });
  const uploadToStorage = useUploadToStorage();

  return {
    transcribe: async ({ blob, type, provider, durationMs, retainAudio }) => {
      const { storageId } = await uploadToStorage(
        () => generateUploadUrlMutation({}) as Promise<string>,
        { blob, type },
      );
      const result = (await transcribeAction({
        audioStorageId: storageId as any,
        provider,
        contentType: type,
        ...(durationMs !== undefined && { durationMs }),
        ...(retainAudio !== undefined && { retainAudio }),
      })) as { text: string };
      return { text: result.text };
    },
    history: (historyRaw as TranscriptionItem[] | undefined) ?? [],
    isAvailable: true,
    isLoading: historyRaw === undefined,
  };
}

export function useStreamingStt(): {
  createSession: (provider: StreamProvider) => Promise<StreamSttSession>;
  saveTranscript: (provider: StreamProvider, text: string, durationMs?: number) => Promise<void>;
} {
  const createSessionAction = useAction(api.stt.stream.createStreamSession);
  const saveTranscriptMutation = useMutation(api.stt.stream.saveStreamTranscript);

  return {
    createSession: async (provider) => {
      const result = (await createSessionAction({ provider })) as StreamSttSession;
      return { mock: result.mock, token: result.token };
    },
    saveTranscript: async (provider, text, durationMs) => {
      try {
        await saveTranscriptMutation({
          provider,
          text,
          ...(durationMs !== undefined && { durationMs }),
        });
      } catch {
        // Persistence is advisory; the transcript remains available to the caller.
      }
    },
  };
}
