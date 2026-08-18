import { Navigate } from "@tanstack/react-router";
import { publicHomePath } from "@/app/public-routes";
import { useAuth } from "@/features/auth";
import { useOnboarding } from "@/features/onboarding";
import { isDesktopHost } from "@/lib/desktop-host";
import { RouteLoadingState } from "@/shared/components/route-loading-state";

// Index is a smart redirector. On the web, unauthenticated visitors see the
// marketing landing page; inside the desktop shell they go straight to sign-in —
// an installed app has no use for the sales page. Authenticated users are sent to
// the post-login destination by onboarding state: /welcome if incomplete, /home.
export function RootRedirect() {
  const { isAuthenticated, isLoading: authLoading } = useAuth();
  const { isComplete: onboardingComplete, isLoading: onbLoading } = useOnboarding();

  if (authLoading) return <RouteLoadingState />;
  // Desktop skips marketing — land on the product (sign-in when signed out).
  if (!isAuthenticated) {
    return <Navigate to={isDesktopHost ? "/sign-in" : publicHomePath()} replace />;
  }
  if (!onbLoading && !onboardingComplete) {
    return <Navigate to="/welcome" replace />;
  }
  if (onbLoading) return <RouteLoadingState />;
  return <Navigate to="/home" replace />;
}
