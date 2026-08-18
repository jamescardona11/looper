import type { Tier, TierConfig } from "@looper/config/billing";

const MESSAGE_LIMIT_FEATURES = new Set([
  "billing.feat.messages10PerDay",
  "billing.feat.messages100PerDay",
  "billing.feat.unlimitedMessages",
]);

export function includedMarketingFeatures(
  tier: Tier,
  tiers: readonly TierConfig[],
): readonly string[] {
  const tierIndex = tiers.findIndex((candidate) => candidate.tier === tier);
  if (tierIndex < 0) return [];

  const included: string[] = [];
  const includedSet = new Set<string>();
  let messageLimitIndex = -1;

  for (let index = 0; index <= tierIndex; index += 1) {
    for (const feature of tiers[index]!.marketingFeatures) {
      if (MESSAGE_LIMIT_FEATURES.has(feature)) {
        if (messageLimitIndex >= 0) {
          includedSet.delete(included[messageLimitIndex]!);
          included.splice(messageLimitIndex, 1);
        }
        messageLimitIndex = included.length;
      }
      if (includedSet.has(feature)) continue;
      included.push(feature);
      includedSet.add(feature);
    }
  }

  return included;
}
