import { createFileRoute } from "@tanstack/react-router";
import { TermsPage } from "@/features/legal";

export const Route = createFileRoute("/terms")({
  component: TermsPage,
});
