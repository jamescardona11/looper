export type PaymentEventApplication = {
  findExisting: () => Promise<unknown>;
  applyEffects: () => Promise<void>;
  recordEvent: () => Promise<void>;
};

export type PaymentEventOutcome = "duplicate" | "processed";

export async function applyPaymentEvent({
  findExisting,
  applyEffects,
  recordEvent,
}: PaymentEventApplication): Promise<PaymentEventOutcome> {
  if (await findExisting()) return "duplicate";

  await applyEffects();
  await recordEvent();
  return "processed";
}
