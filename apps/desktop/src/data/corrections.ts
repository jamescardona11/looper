// Data boundary for corrections learning (F5.2, see src-tauri/src/corrections.rs):
// the suggestion queue built from repeated post-insertion corrections. All
// three commands return the remaining suggestion list so callers can refresh
// their cache from the response. Everything is local-only - nothing here
// touches Convex.
import { invoke } from "@tauri-apps/api/core";

export type SuggestedCorrection = {
  from: string;
  to: string;
  count: number;
};

export async function getSuggestedCorrections(): Promise<
  SuggestedCorrection[]
> {
  return invoke<SuggestedCorrection[]>("get_suggested_corrections");
}

/** Accepts a suggestion: adds `to` to the local dictionary via the existing
 * dictionary command on the Rust side and drops the counter. */
export async function acceptSuggestedCorrection(
  from: string,
  to: string,
): Promise<SuggestedCorrection[]> {
  return invoke<SuggestedCorrection[]>("accept_suggested_correction", {
    from,
    to,
  });
}

/** Dismisses a suggestion permanently: that exact from→to pair is never
 * suggested again. */
export async function dismissSuggestedCorrection(
  from: string,
  to: string,
): Promise<SuggestedCorrection[]> {
  return invoke<SuggestedCorrection[]>("dismiss_suggested_correction", {
    from,
    to,
  });
}
