export type ToastType =
  | "error"
  | "info"
  | "success"
  | "warning"
  | "update"
  | "celebration";

export interface ToastPayload {
  type: ToastType;
  message: string;
  title?: string;
  autoDismiss?: boolean;
  duration?: number;
  retryId?: string;
  mode?: "local" | "cloud";
  action?: string;
  actionLabel?: string;
  secondaryAction?: string;
  secondaryActionLabel?: string;
}
