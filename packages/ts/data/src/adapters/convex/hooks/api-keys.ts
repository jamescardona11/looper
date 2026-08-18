import { api } from "@looper/backend/convex/_generated/api";
import { useAction, useMutation, useQuery } from "convex/react";
import type { ApiKeyProvider, ApiKeyTestResult, ProviderKeyStatus } from "../../../types";

// BYOK across all LLM providers. `status` returns one entry per provider;
// save/test/clear are parameterized by provider. Not an optional feature.
//
// Domain boundary: the backend `provider` arg is a strict union validator; the
// domain type widens it to `string`, so the cast stays inside the adapter. `test`
// returns the live credential-check result ({ ok, error }) the mobile UI reads.
export function useApiKeys() {
  const data = useQuery(api.userKeys.keys.status);
  const save = useAction(api.userKeys.keys.saveKey);
  const test = useAction(api.userKeys.keys.testKey);
  const clear = useMutation(api.userKeys.keys.clearKey);

  return {
    keys: (data ?? []) as ProviderKeyStatus[],
    isLoading: data === undefined,
    save: async (provider: ApiKeyProvider, plaintext: string): Promise<void> => {
      await save({ provider: provider as never, plaintext });
    },
    test: (provider: ApiKeyProvider): Promise<ApiKeyTestResult> =>
      test({ provider: provider as never }) as Promise<ApiKeyTestResult>,
    clear: async (provider: ApiKeyProvider): Promise<void> => {
      await clear({ provider: provider as never });
    },
  };
}
