import { File, Paths } from "expo-file-system";
import { PermissionsAndroid, Platform } from "react-native";
import { LOCAL_STT_MODEL_ID, normalizeLocalSttProgress, toNativeFilePath } from "./local-stt-model";

export interface LocalSttDownloadProgress {
  percent: number;
  phase: "downloading" | "extracting";
}

export async function isLocalSttModelInstalled(): Promise<boolean> {
  const { isModelDownloadedByCategory, ModelCategory } = await import(
    "react-native-sherpa-onnx/download"
  );
  return isModelDownloadedByCategory(ModelCategory.Stt, LOCAL_STT_MODEL_ID);
}

export async function installLocalSttModel(
  onProgress?: (progress: LocalSttDownloadProgress) => void,
): Promise<void> {
  await requestAndroidDownloadNotificationPermission();
  const { ensureModelByCategory, ModelCategory, refreshModelsByCategory } = await import(
    "react-native-sherpa-onnx/download"
  );
  await refreshModelsByCategory(ModelCategory.Stt);
  await ensureModelByCategory(ModelCategory.Stt, LOCAL_STT_MODEL_ID, {
    deleteArchiveAfterExtract: true,
    onProgress: (progress) => {
      onProgress?.({
        percent: normalizeLocalSttProgress(progress.percent),
        phase: progress.phase ?? "downloading",
      });
    },
  });
}

export async function deleteLocalSttModel(): Promise<void> {
  const { deleteModelByCategory, ModelCategory } = await import(
    "react-native-sherpa-onnx/download"
  );
  await deleteModelByCategory(ModelCategory.Stt, LOCAL_STT_MODEL_ID);
}

export async function getLocalSttModelPath(): Promise<string | null> {
  const { getLocalModelPathByCategory, ModelCategory } = await import(
    "react-native-sherpa-onnx/download"
  );
  return getLocalModelPathByCategory(ModelCategory.Stt, LOCAL_STT_MODEL_ID);
}

export async function transcribeWithLocalStt(audioUri: string): Promise<string> {
  const modelPath = await getLocalSttModelPath();
  if (!modelPath) throw new Error("El modelo local no está instalado.");

  const temporaryWav = new File(Paths.cache, `looper-local-stt-${Date.now()}.wav`);
  const inputPath = toNativeFilePath(audioUri);
  const outputPath = toNativeFilePath(temporaryWav.uri);
  let engine: Awaited<ReturnType<typeof import("react-native-sherpa-onnx/stt").createSTT>> | null =
    null;

  try {
    const [{ convertAudioToWav16k }, { createSTT }] = await Promise.all([
      import("react-native-sherpa-onnx/audio"),
      import("react-native-sherpa-onnx/stt"),
    ]);
    await convertAudioToWav16k(inputPath, outputPath);
    engine = await createSTT({
      modelPath: { type: "file", path: modelPath },
      modelType: "nemo_transducer",
      preferInt8: true,
      numThreads: 2,
      provider: "cpu",
      debug: false,
    });
    const result = await engine.transcribeFile(outputPath);
    return result.text.trim();
  } finally {
    try {
      if (engine) await engine.destroy();
    } finally {
      try {
        if (temporaryWav.exists) temporaryWav.delete();
      } catch {
        // El sistema puede desalojar la caché si esta limpieza falla.
      }
    }
  }
}

async function requestAndroidDownloadNotificationPermission(): Promise<void> {
  if (Platform.OS !== "android" || Number(Platform.Version) < 33) return;
  await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS);
}
