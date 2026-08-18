import { ConvexProvider, configFromEnv, type RawEnv } from "@looper/data";
import type { PropsWithChildren } from "react";
import { AnonymousAutoSignIn } from "@/features/auth";
import { browserAuthStorage, browserQueryCache } from "@/lib/query-cache";
import { browserStorageUploader } from "@/lib/upload";
import { TranscribeFixtureSmoke } from "@/shared/testing/transcribe-fixture-smoke";
import { WebCaptureFixtureSmoke } from "@/shared/testing/web-capture-fixture-smoke";

export function Providers({ children }: PropsWithChildren): React.ReactNode {
  const config = configFromEnv(import.meta.env as unknown as RawEnv, {
    cache: browserQueryCache,
    storage: browserAuthStorage,
    storageUploader: browserStorageUploader,
  });

  return (
    <ConvexProvider config={config}>
      <AnonymousAutoSignIn />
      <TranscribeFixtureSmoke />
      <WebCaptureFixtureSmoke />
      {children}
    </ConvexProvider>
  );
}
