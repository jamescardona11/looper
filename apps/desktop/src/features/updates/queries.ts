import { useQuery } from "@tanstack/react-query";

import { updateStatusQuery } from "./update-query-policy";

export { updateKeys } from "./update-query-policy";

export function useUpdateStatus() {
  return useQuery(updateStatusQuery());
}
