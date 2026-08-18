import { createFileRoute } from "@tanstack/react-router";
import { SignInPage } from "@/features/auth";

export const Route = createFileRoute("/sign-in")({
  component: SignInPage,
});
