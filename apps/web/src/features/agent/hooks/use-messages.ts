// Thin wrapper over the @looper/data domain hook. The domain `useMessages`
// owns the persisted-query read, the upload protocol, and the Convex Id<> casts;
// this file keeps the feature's public API stable:
//   - re-exports the `ChatMessage` type under the same name,
//   - exposes the text-only recording-assistant message boundary.

import { useMessages as useMessagesDomain } from "@looper/data";

export type { ChatMessage } from "@looper/data";

export function useMessages(threadId: string | null) {
  const { messages, isLoading, send, regenerate, stop, edit } = useMessagesDomain(threadId);

  return {
    messages,
    isLoading,
    send,
    regenerate,
    stop,
    edit,
  };
}
