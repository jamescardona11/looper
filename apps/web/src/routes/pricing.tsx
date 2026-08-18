import { createFileRoute } from "@tanstack/react-router";
import { PricingPage } from "@/features/marketing";

export const Route = createFileRoute("/pricing")({
  component: PricingPage,
});
