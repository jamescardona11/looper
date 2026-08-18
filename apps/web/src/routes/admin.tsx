import { createFileRoute } from "@tanstack/react-router";
import { AdminPage } from "@/features/admin";

export const Route = createFileRoute("/admin")({
  component: AdminPage,
});
