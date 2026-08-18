import { createFileRoute } from "@tanstack/react-router";
import { WaitlistPage } from "@/features/marketing";

export const Route = createFileRoute("/waitlist")({
  component: WaitlistRoute,
  validateSearch: (search: Record<string, unknown>) => ({
    ref: typeof search.ref === "string" ? search.ref : undefined,
  }),
});

function WaitlistRoute() {
  const { ref } = Route.useSearch();
  return <WaitlistPage referredBy={ref} />;
}
