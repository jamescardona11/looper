import { describe, expect, test } from "vitest";
import type { SpeechModel } from "../../../../types/index";
import {
  modelKeys,
  normalizeModelKeys,
  resolveSpeechModelLabel,
} from "../models-queries";
import { summarizeModelStatuses } from "../model-query-contracts";

const speechModel = (overrides: Partial<SpeechModel>): SpeechModel => ({
  id: "parakeet",
  key: "parakeet-q8",
  label: "Parakeet",
  description: "Local speech model",
  size_mb: 700,
  engine_id: "parakeet",
  variant: "Q8_0",
  tags: [],
  installed: true,
  remote: false,
  capabilities: [],
  supported_languages: [],
  ...overrides,
});

describe("settings model queries", () => {
  test("normalizes model keys without reordering the first occurrence", () => {
    expect(
      normalizeModelKeys([" parakeet ", "", "cohere", "parakeet"]),
    ).toEqual(["parakeet", "cohere"]);
  });

  test("resolves labels by native id or key before using the fallback", () => {
    const models = [speechModel({})];
    expect(resolveSpeechModelLabel(models, "parakeet")).toBe("Parakeet");
    expect(resolveSpeechModelLabel(models, "parakeet-q8")).toBe("Parakeet");
    expect(resolveSpeechModelLabel(models, "custom_model")).toBe(
      "custom_model",
    );
    expect(resolveSpeechModelLabel(models, "  ")).toBeNull();
  });

  test("keeps stable cache keys for catalog and individual status", () => {
    expect(modelKeys.catalog()).toEqual(["models", "catalog"]);
    expect(modelKeys.status("parakeet")).toEqual([
      "models",
      "status",
      "parakeet",
    ]);
  });

  test("projects status results by normalized model and aggregates activity", () => {
    const installed = {
      key: "parakeet",
      installed: true,
      ane_installed: false,
      directory: "/models/parakeet",
      bytes_on_disk: 700,
      missing_files: [],
    };
    expect(
      summarizeModelStatuses(
        ["parakeet", "remote"],
        [
          { data: installed, isLoading: false, isFetching: false },
          { isLoading: true, isFetching: true },
        ],
      ),
    ).toEqual({
      statusByModel: { parakeet: installed },
      isLoading: true,
      isFetching: true,
    });
  });
});
