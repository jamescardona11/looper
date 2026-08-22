import { Navigate } from "@tanstack/react-router";
import { publicHomePath } from "@/app/public-routes";
import { useAuth } from "@/features/auth";
import { useOnboarding } from "@/features/onboarding";
import { RouteLoadingState } from "@/shared/components/route-loading-state";

// Index is a smart redirector. Unauthenticated visitors see the marketing
// landing page. Authenticated users are sent to the post-login destination by
// onboarding state: /welcome if incomplete, /home otherwise.
export function RootRedirect() {
  const { isAuthenticated, isLoading: authLoading } = useAuth();
  const { isComplete: onboardingComplete, isLoading: onbLoading } = useOnboarding();

  if (authLoading) return <RouteLoadingState />;
  if (!isAuthenticated) {
    return <Navigate to={publicHomePath()} replace />;
  }
  if (!onbLoading && !onboardingComplete) {
    return <Navigate to="/welcome" replace />;
  }
  if (onbLoading) return <RouteLoadingState />;
  return <Navigate to="/home" replace />;
}
