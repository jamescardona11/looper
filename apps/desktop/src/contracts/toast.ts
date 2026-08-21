type ToastKinds = [
  "error",
  "info",
  "success",
  "warning",
  "update",
  "celebration",
];

export type ToastType = ToastKinds[number];

type OptionalValue<Key extends PropertyKey, Value> = Partial<
  Record<Key, Value>
>;

type ToastMessage = {
  type: ToastType;
  message: string;
} & OptionalValue<"title", string>;

type ToastLifetime = OptionalValue<"autoDismiss", boolean> &
  OptionalValue<"duration", number>;

type ToastActions = OptionalValue<
  | "retryId"
  | "action"
  | "actionLabel"
  | "secondaryAction"
  | "secondaryActionLabel",
  string
> &
  OptionalValue<"mode", "local" | "cloud">;

export type ToastPayload = ToastMessage & ToastLifetime & ToastActions;
