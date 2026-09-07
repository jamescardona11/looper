import { createFileRoute } from "@tanstack/react-router";
import { Navigate } from "@tanstack/react-router";

export const Route = createFileRoute("/pricing")({
  component: () => <Navigate to="/landing" replace />,
});
