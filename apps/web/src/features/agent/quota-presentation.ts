export function hasDisplayableQuota(
  remaining: number | null | undefined,
  limit: number | null | undefined,
): remaining is number {
  return (
    typeof remaining === "number" &&
    Number.isFinite(remaining) &&
    typeof limit === "number" &&
    Number.isFinite(limit) &&
    limit > 0
  );
}
