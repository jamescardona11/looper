import { createFileRoute } from "@tanstack/react-router";
import { DictationPage } from "@/features/dictation";

export const Route = createFileRoute("/dictation")({
  component: DictationPage,
});
