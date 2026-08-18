// biome-ignore-all assist/source/organizeImports: module markers keep optional imports removable.
import { createRootRoute } from "@tanstack/react-router";
import { Providers } from "@/app/providers";
import { RootErrorBoundary, RootNotFound, WebAppShell } from "@/app/shell";

export const Route = createRootRoute({
  component: () => (
    <Providers>
      <WebAppShell />
    </Providers>
  ),
  errorComponent: RootErrorBoundary,
  notFoundComponent: RootNotFound,
});
