import { createFileRoute } from "@tanstack/react-router";
import { UsageDashboard } from "@/features/usage";

export const Route = createFileRoute("/usage")({
  component: UsageDashboard,
});
