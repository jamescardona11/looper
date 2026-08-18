import { createFileRoute } from "@tanstack/react-router";
import { ChangelogPage } from "@/features/changelog";

export const Route = createFileRoute("/changelog")({
  component: ChangelogPage,
});
