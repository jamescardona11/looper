import { createFileRoute } from "@tanstack/react-router";
import { AgentWorkspace } from "@/features/agent";

export const Route = createFileRoute("/agent")({
  validateSearch: (search: Record<string, unknown>) => ({
    thread: typeof search.thread === "string" ? search.thread : undefined,
  }),
  component: AgentRoute,
});

function AgentRoute() {
  const { thread } = Route.useSearch();
  return <AgentWorkspace activeThreadId={thread ?? null} />;
}
