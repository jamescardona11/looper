import * as updateGateway from "../../data/system/updates";

const UPDATE_CACHE_ROOT = ["updates"] as const;

export const updateKeys = {
  status: () => [...UPDATE_CACHE_ROOT, "status"] as const,
};

export function updateStatusQuery() {
  return {
    queryKey: updateKeys.status(),
    queryFn: updateGateway.getUpdateStatus,
  };
}
