import { createFileRoute } from "@tanstack/react-router";
import { RootRedirect } from "@/app/root-redirect";

export const Route = createFileRoute("/")({
  component: RootRedirect,
});
