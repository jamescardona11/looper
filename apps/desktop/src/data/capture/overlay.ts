import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import type {
  PillHoverPayload,
  PillModePayload,
  PillStatePayload,
} from "../../contracts/index";

export type OverlayPosition = {
  x: number;
  y: number;
};

export type MeetingTranscriptPlacement = "above" | "left" | "right";
export type MeetingTranscriptSideAlignment = "top" | "bottom";

export type MeetingOverlayPresentation = {
  compact: boolean;
  transcriptVisible: boolean;
  transcriptPinned: boolean;
};

export type PillInsertedPayload = {
  chars: number;
  can_undo: boolean;
};

export function subscribePillInserted(
  handler: (payload: PillInsertedPayload) => void,
): Promise<UnlistenFn> {
  return listen<PillInsertedPayload>("pill:inserted", ({ payload }) =>
    handler(payload),
  );
}

export const subscribePillState = (
  handler: (payload: PillStatePayload) => void,
) => listen<PillStatePayload>("pill:state", ({ payload }) => handler(payload));

export const subscribePillMode = (
  handler: (payload: PillModePayload) => void,
) => listen<PillModePayload>("pill:mode", ({ payload }) => handler(payload));

export const subscribePillHover = (
  handler: (payload: PillHoverPayload) => void,
) => listen<PillHoverPayload>("pill:hover", ({ payload }) => handler(payload));

export const subscribePillError = (
  handler: (payload: { retry_id: string | null }) => void,
) =>
  listen<{ retry_id: string | null }>("pill:error", ({ payload }) =>
    handler(payload),
  );

export async function setOverlayPosition(
  position: OverlayPosition,
): Promise<OverlayPosition> {
  return invoke<OverlayPosition>("set_overlay_position", position);
}

export function subscribeOverlayPosition(
  handler: (position: OverlayPosition) => void,
): Promise<UnlistenFn> {
  return listen<OverlayPosition>("pill:position", ({ payload }) =>
    handler(payload),
  );
}

// El área que acepta clics se deduce de esto: la píldora es la única que sabe
// cuánto mide después de cada cambio de estado.
export function setPillHitSize(width: number, height: number): Promise<void> {
  return invoke<void>("set_pill_hit_size", { width, height });
}

export async function setMeetingOverlayPresentation(
  presentation: MeetingOverlayPresentation,
): Promise<{
  placement: MeetingTranscriptPlacement;
  sideAlignment: MeetingTranscriptSideAlignment;
}> {
  return invoke<{
    placement: MeetingTranscriptPlacement;
    sideAlignment: MeetingTranscriptSideAlignment;
  }>("set_meeting_overlay_presentation", presentation);
}
