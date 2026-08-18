import type { MessageDescriptor } from "@lingui/core";
import { describe, expect, it } from "vitest";
import { buildAppTabOptions } from "./useAppTabOptions";

const english = (copy: MessageDescriptor) => copy.message ?? copy.id ?? "";

describe("buildAppTabOptions", () => {
  it("preserves the product ordering and labels for every choice family", () => {
    const options = buildAppTabOptions(english);

    expect(options.textSize).toEqual([
      { value: "small", label: "Small" },
      { value: "default", label: "Default" },
      { value: "large", label: "Large" },
    ]);
    expect(options.themes.map(({ value }) => value)).toEqual([
      "system",
      "light",
      "dark",
    ]);
    expect(options.prunePolicies.map(({ value }) => value)).toEqual([
      "never",
      "immediately",
      "day",
      "week",
      "month",
      "year",
    ]);
    expect(options.pruneTargets).toEqual([
      { value: "audio", label: "Audio" },
      { value: "transcripts", label: "Transcripts" },
    ]);
  });

  it("formats storage budgets and keeps the system locale first", () => {
    const options = buildAppTabOptions(english);

    expect(options.audioBudgets).toEqual([
      { value: 0, label: "No limit" },
      { value: 256, label: "256 MB" },
      { value: 512, label: "512 MB" },
      { value: 1024, label: "1 GB" },
      { value: 2048, label: "2 GB" },
      { value: 5120, label: "5 GB" },
      { value: 10240, label: "10 GB" },
    ]);
    expect(options.appLanguages[0]).toEqual({
      value: "system",
      label: "System",
    });
  });
});
