import { createFileRoute } from "@tanstack/react-router";
import { LandingPage } from "@/features/marketing";

export const Route = createFileRoute("/landing")({
  component: LandingPage,
});
