import { TIERS } from "@looper/config/billing";
import { describe, expect, it } from "vitest";
import { includedMarketingFeatures } from "./marketing-features";

describe("includedMarketingFeatures", () => {
  it("keeps the free plan limited to its own features", () => {
    expect(includedMarketingFeatures("free", TIERS)).toEqual(TIERS[0]?.marketingFeatures);
  });

  it("inherits capabilities while replacing superseded message limits", () => {
    const pro = includedMarketingFeatures("pro", TIERS);
    const ultra = includedMarketingFeatures("ultra", TIERS);

    expect(pro).toEqual([
      "billing.feat.anonEmailLogin",
      "billing.feat.cloudAudioHistory",
      ...TIERS[1]!.marketingFeatures,
    ]);
    expect(ultra).toEqual([
      "billing.feat.anonEmailLogin",
      "billing.feat.cloudAudioHistory",
      "billing.feat.syncedTranscriptMemory",
      "billing.feat.audioUsageMetrics",
      ...TIERS[2]!.marketingFeatures,
    ]);
  });
});
