import { beforeEach, describe, expect, it, vi } from "vitest";
import { LOCAL_STT_MODEL_ID } from "../local-stt-model";

const mocks = vi.hoisted(() => ({
  convertAudioToWav16k: vi.fn(),
  createSTT: vi.fn(),
  deleteModelByCategory: vi.fn(),
  deleteTemporaryFile: vi.fn(),
  destroy: vi.fn(),
  ensureModelByCategory: vi.fn(),
  getLocalModelPathByCategory: vi.fn(),
  isModelDownloadedByCategory: vi.fn(),
  refreshModelsByCategory: vi.fn(),
  requestPermission: vi.fn(),
  transcribeFile: vi.fn(),
}));

vi.mock("expo-file-system", () => ({
  Paths: { cache: "/cache" },
  File: class {
    uri: string;
    exists = true;

    constructor(_base: string, name: string) {
      this.uri = `file:///cache/${name}`;
    }

    delete() {
      mocks.deleteTemporaryFile();
    }
  },
}));

vi.mock("react-native", () => ({
  Platform: { OS: "android", Version: 34 },
  PermissionsAndroid: {
    PERMISSIONS: { POST_NOTIFICATIONS: "android.permission.POST_NOTIFICATIONS" },
    request: mocks.requestPermission,
  },
}));

vi.mock("react-native-sherpa-onnx/audio", () => ({
  convertAudioToWav16k: mocks.convertAudioToWav16k,
}));

vi.mock("react-native-sherpa-onnx/stt", () => ({ createSTT: mocks.createSTT }));

vi.mock("react-native-sherpa-onnx/download", () => ({
  ModelCategory: { Stt: "stt" },
  deleteModelByCategory: mocks.deleteModelByCategory,
  ensureModelByCategory: mocks.ensureModelByCategory,
  getLocalModelPathByCategory: mocks.getLocalModelPathByCategory,
  isModelDownloadedByCategory: mocks.isModelDownloadedByCategory,
  refreshModelsByCategory: mocks.refreshModelsByCategory,
}));

import { installLocalSttModel, transcribeWithLocalStt } from "../local-stt-runtime";

describe("local STT runtime", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getLocalModelPathByCategory.mockResolvedValue("/models/parakeet");
    mocks.transcribeFile.mockResolvedValue({ text: "  transcripción privada  " });
    mocks.createSTT.mockResolvedValue({
      transcribeFile: mocks.transcribeFile,
      destroy: mocks.destroy,
    });
  });

  it("convierte audio, transcribe en CPU y libera recursos nativos", async () => {
    await expect(transcribeWithLocalStt("file:///tmp/nota%20de%20voz.m4a")).resolves.toBe(
      "transcripción privada",
    );

    expect(mocks.convertAudioToWav16k).toHaveBeenCalledWith(
      "/tmp/nota de voz.m4a",
      expect.stringMatching(/^\/cache\/looper-local-stt-\d+\.wav$/),
    );
    expect(mocks.createSTT).toHaveBeenCalledWith(
      expect.objectContaining({
        modelPath: { type: "file", path: "/models/parakeet" },
        modelType: "nemo_transducer",
        preferInt8: true,
        provider: "cpu",
      }),
    );
    expect(mocks.destroy).toHaveBeenCalledOnce();
    expect(mocks.deleteTemporaryFile).toHaveBeenCalledOnce();
  });

  it("libera el reconocedor y el audio temporal si falla la inferencia", async () => {
    mocks.transcribeFile.mockRejectedValueOnce(new Error("falló la inferencia nativa"));

    await expect(transcribeWithLocalStt("/tmp/nota.wav")).rejects.toThrow(
      "falló la inferencia nativa",
    );
    expect(mocks.destroy).toHaveBeenCalledOnce();
    expect(mocks.deleteTemporaryFile).toHaveBeenCalledOnce();
  });

  it("pide permiso de notificaciones y delega una instalación reanudable", async () => {
    mocks.ensureModelByCategory.mockImplementationOnce(
      async (_category: string, _id: string, options: { onProgress: (value: object) => void }) => {
        options.onProgress({ percent: 41.7, phase: "extracting" });
      },
    );
    const progress = vi.fn();

    await installLocalSttModel(progress);

    expect(mocks.requestPermission).toHaveBeenCalledWith("android.permission.POST_NOTIFICATIONS");
    expect(mocks.refreshModelsByCategory).toHaveBeenCalledWith("stt");
    expect(mocks.ensureModelByCategory).toHaveBeenCalledWith(
      "stt",
      LOCAL_STT_MODEL_ID,
      expect.objectContaining({ deleteArchiveAfterExtract: true }),
    );
    expect(progress).toHaveBeenCalledWith({ percent: 42, phase: "extracting" });
  });
});
