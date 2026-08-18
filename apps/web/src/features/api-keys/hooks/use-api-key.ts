import { useApiKeys as useApiKeysDomain } from "@looper/data";

export type ApiKeyProvider = "openai" | "anthropic" | "google";

export interface ProviderKeyStatus {
  provider: ApiKeyProvider;
  label: string;
  configured: boolean;
  createdAt: number | null;
  lastTestedAt: number | null;
  lastTestOk: boolean | null;
  lastTestError: string | null;
}

// BYOK across all LLM providers. `providers` returns one entry per provider;
// save/test/clear are parameterized by provider. Thin wrapper over the
// @looper/data domain hook: maps the domain `keys` field onto this feature's
// public `providers` shape so consumers stay untouched.
export function useApiKeys() {
  const { keys, isLoading, save, test, clear } = useApiKeysDomain();
  return {
    providers: keys as ProviderKeyStatus[] | null,
    isLoading,
    save: (provider: ApiKeyProvider, plaintext: string) => save(provider, plaintext),
    test: (provider: ApiKeyProvider) => test(provider),
    clear: (provider: ApiKeyProvider) => clear(provider),
  };
}
