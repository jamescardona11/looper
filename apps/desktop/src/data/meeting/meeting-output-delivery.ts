// Delivers user-confirmed Markdown Companion exports.
import { api } from "@looper/backend/convex/_generated/api";
import { invoke } from "@tauri-apps/api/core";
import { createConvexClient, ensureAnonymousSession } from "../sync/convex-auth";

const DELIVERY_INTERVAL_MS = 30_000;

type ClaimedMarkdownOutput = {
  outputId: string;
  meetingId: string;
  preview: string;
};

/** Runs in Desktop's main window and safely retries an interrupted local write. */
export function startConfirmedMeetingOutputDelivery(): () => void {
  const client = createConvexClient();
  if (!client) return () => {};
  ensureAnonymousSession(client);

  let closed = false;
  let delivering = false;

  const deliverNext = async () => {
    if (closed || delivering) return;
    delivering = true;
    const claimId = crypto.randomUUID();
    let output: ClaimedMarkdownOutput | null = null;
    try {
      output = await client.mutation(
        (api as any).meetings.sessions.claimConfirmedMarkdownOutput,
        { claimId },
      );
      if (!output || closed) return;
      const path = await invoke<string | null>(
        "mirror_confirmed_meeting_output",
        {
          outputId: output.outputId,
          meetingId: output.meetingId,
          content: output.preview,
        },
      );
      await client.mutation(
        (api as any).meetings.sessions.completeMarkdownOutputDelivery,
        { outputId: output.outputId, claimId, delivered: Boolean(path) },
      );
    } catch (error) {
      if (output && !closed) {
        try {
          await client.mutation(
            (api as any).meetings.sessions.completeMarkdownOutputDelivery,
            { outputId: output.outputId, claimId, delivered: false },
          );
        } catch {
          // The short-lived claim expires server-side after a Desktop crash.
        }
      }
      console.warn("[live-meeting] confirmed Markdown delivery failed", error);
    } finally {
      delivering = false;
    }
  };

  void deliverNext();
  const timer = window.setInterval(
    () => void deliverNext(),
    DELIVERY_INTERVAL_MS,
  );
  return () => {
    closed = true;
    window.clearInterval(timer);
    client.close();
  };
}
