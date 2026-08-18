import { createFileRoute } from "@tanstack/react-router";
import { PrivacyPage } from "@/features/legal";

export const Route = createFileRoute("/privacy")({
  component: PrivacyPage,
});
