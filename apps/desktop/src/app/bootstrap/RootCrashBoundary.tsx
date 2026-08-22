import { Component, type ErrorInfo, type PropsWithChildren } from "react";

import type { FrontendCrashReporter } from "./frontend-crash";

type RootCrashBoundaryProps = PropsWithChildren<{
  report: FrontendCrashReporter;
}>;

type RootCrashBoundaryState = { failed: boolean };

export class RootCrashBoundary extends Component<
  RootCrashBoundaryProps,
  RootCrashBoundaryState
> {
  state: RootCrashBoundaryState = { failed: false };

  static getDerivedStateFromError(): RootCrashBoundaryState {
    return { failed: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    this.props.report("render", error, info.componentStack ?? "");
  }

  render() {
    return this.state.failed ? <CrashFallback /> : this.props.children;
  }
}

function CrashFallback() {
  return (
    <main
      style={{
        minHeight: "100vh",
        display: "grid",
        placeItems: "center",
        padding: 24,
        background: "var(--color-bg-primary)",
        color: "var(--color-text-primary)",
        fontFamily: "var(--font-ui)",
        textAlign: "center",
      }}
    >
      <div>
        <h1 style={{ margin: 0, fontSize: 18, fontWeight: 600 }}>
          Looper hit an error
        </h1>
        <p style={{ margin: "8px 0 0", fontSize: 14 }}>
          Please restart the app.
        </p>
      </div>
    </main>
  );
}
