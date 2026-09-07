import { createFileRoute, Navigate } from "@tanstack/react-router";

export const Route = createFileRoute("/billing")({
  component: () => <Navigate to="/settings" replace />,
});
