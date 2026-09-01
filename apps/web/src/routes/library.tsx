import { createFileRoute } from "@tanstack/react-router";
import { LibraryPage } from "@/features/library";

export const Route = createFileRoute("/library")({
  validateSearch: (search: Record<string, unknown>) => ({
    note: typeof search.note === "string" ? search.note : undefined,
  }),
  component: LibraryRoute,
});

function LibraryRoute() {
  const { note } = Route.useSearch();
  const navigate = Route.useNavigate();

  return (
    <LibraryPage
      selectedNoteId={note ?? null}
      onSelectNote={(noteId) => void navigate({ search: { note: noteId } })}
      onCloseNote={() => void navigate({ search: { note: undefined } })}
    />
  );
}
