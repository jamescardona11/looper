import { useAuth } from "@looper/data";
import { Navigate } from "@tanstack/react-router";
import type { ReactElement, ReactNode } from "react";
import { RouteLoadingState } from "@/shared/components/route-loading-state";

// Route-level auth gate. Consolidates the repeated
//   if (isLoading) return <loading>;
//   if (!isAuthenticated) return <Navigate to="/sign-in" replace />;
// that was copy-pasted across protected routes. Returns an element to render
// when the user can't proceed (a visible loading fallback while auth resolves, or a
// redirect to sign-in when signed out), or null when the user may continue:
//
//   const gate = useRequireAuth();              // shared route loading state
//   const gate = useRequireAuth({ loading: <Loader /> });
//   if (gate) return gate;
//
// Routes with extra conditions (admin checks, onboarding redirects, the
// inverse sign-in gate) keep their own logic — this only covers the plain
// "signed-in or bounce to /sign-in" case.
export function useRequireAuth(opts?: { loading?: ReactNode }): ReactElement | null {
  const { isAuthenticated, isLoading } = useAuth();
  if (isLoading) return <>{opts?.loading ?? <RouteLoadingState />}</>;
  if (!isAuthenticated) return <Navigate to="/sign-in" replace />;
  return null;
}
