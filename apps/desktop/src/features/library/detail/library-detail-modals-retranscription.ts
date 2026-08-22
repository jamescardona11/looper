import type { LibraryItem, LibraryItemPatch } from "../../../contracts";

type RetranscriptionOptions = {
  model_key: string;
  show_timestamps: boolean;
  detect_speakers: boolean;
};

type CompleteRetranscriptionOptions = {
  item: LibraryItem;
  options: RetranscriptionOptions;
  onUpdate: (patch: LibraryItemPatch) => Promise<LibraryItem>;
  onRetry: () => Promise<void>;
  onClose: () => void;
};

export function buildRetranscriptionPatch(
  item: LibraryItem,
  options: RetranscriptionOptions,
): LibraryItemPatch {
  const { model_key: model, show_timestamps: timestamps } = options;

  return {
    speech_model: model,
    llm_cleanup_enabled: false,
    denoise_enabled: item.denoise_enabled,
    show_timestamps: timestamps,
    detect_speakers: options.detect_speakers,
  };
}

export async function completeLibraryRetranscription(
  request: CompleteRetranscriptionOptions,
) {
  const patch = buildRetranscriptionPatch(request.item, request.options);

  try {
    await request.onUpdate(patch);
    await request.onRetry();
    request.onClose();
  } catch (reason) {
    console.error("Failed to retranscribe:", reason);
  }
}
