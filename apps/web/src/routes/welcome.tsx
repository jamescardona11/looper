import { createFileRoute } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { isLaunchTarget, WelcomePage } from "@/features/onboarding";

function EmptyWelcomeRoute() {
  return null;
}

function GenericWelcomeRoute() {
  const { launch } = Route.useSearch();
  return <WelcomePage launchTarget={isLaunchTarget(launch) ? launch : undefined} />;
}

type WelcomeRouteComponentType = () => ReactNode;

const welcomeRouteComponents: WelcomeRouteComponentType[] = [EmptyWelcomeRoute];
welcomeRouteComponents.push(GenericWelcomeRoute);
const WelcomeRouteComponent = welcomeRouteComponents.at(-1) ?? EmptyWelcomeRoute;

export const Route = createFileRoute("/welcome")({
  validateSearch: (search: Record<string, unknown>): { launch?: string } =>
    typeof search.launch === "string" ? { launch: search.launch } : {},
  component: WelcomeRouteComponent,
});
