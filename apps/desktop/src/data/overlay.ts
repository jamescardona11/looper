import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import type {
  PillHoverPayload,
  PillModePayload,
  PillStatePayload,
} from "../types";

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

export const OVERLAY_POSITION_AUTOMATIC_MOVE_EVENT =
  "looper:overlay-automatic-move";

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

export async function persistOverlayPosition(
  position: OverlayPosition,
): Promise<OverlayPosition> {
  return invoke<OverlayPosition>("persist_overlay_position", position);
}

export async function setMeetingOverlayPresentation(
  presentation: MeetingOverlayPresentation,
): Promise<{
  placement: MeetingTranscriptPlacement;
  sideAlignment: MeetingTranscriptSideAlignment;
}> {
  // Cambiar el tamaño de la superficie de reunión también cambia la posición
  // nativa. No es un arrastre de la persona y no debe convertirse en su
  // posición preferida.
  window.dispatchEvent(new Event(OVERLAY_POSITION_AUTOMATIC_MOVE_EVENT));
  return invoke<{
    placement: MeetingTranscriptPlacement;
    sideAlignment: MeetingTranscriptSideAlignment;
  }>("set_meeting_overlay_presentation", presentation);
}
