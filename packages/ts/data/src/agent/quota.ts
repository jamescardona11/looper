// Pure quota/credits predicates for Recording Assistant clients.
//
// These two rules describe the same product concept (the daily message
// allowance) from two angles: when to WARN the user that credits are low, and
// when to BLOCK sending entirely. Kept as pure functions so clients can share
// one source of truth and composer gates stay unit-testable without rendering.

// CreditsBar "low" threshold: true when the remaining message allowance is at
// or below 20% of the daily limit, but never below an absolute floor of 2.
export function isCreditsLow(remaining: number, limit: number): boolean {
  return remaining <= Math.max(2, Math.floor(limit * 0.2));
}

// Send gate: whether the daily message quota should block sending. A user on
// their own key (byok) or an unlimited tier (remaining null/undefined) is never
// blocked; otherwise sending is blocked once no messages remain.
export function quotaBlocksSend(byok: boolean, remaining: number | null | undefined): boolean {
  return !byok && remaining != null && remaining <= 0;
}
