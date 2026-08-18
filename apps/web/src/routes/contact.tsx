import { createFileRoute } from "@tanstack/react-router";
import { type ContactIntent, ContactPage, resolveContactIntent } from "@/features/marketing";

export const Route = createFileRoute("/contact")({
  validateSearch: (search: Record<string, unknown>): { intent?: ContactIntent } => {
    const intent = resolveContactIntent(search.intent);
    return intent ? { intent } : {};
  },
  component: ContactRoute,
});

function ContactRoute() {
  const { intent } = Route.useSearch();
  return <ContactPage intent={intent} />;
}
