import { createFileRoute } from "@tanstack/react-router";
import { TranscribePage } from "@/features/transcribe";

export const Route = createFileRoute("/transcribe")({
  component: TranscribePage,
});
