import {
  hasModelCapability,
  MODEL_CAPABILITY_TIMESTAMPS,
} from "../../../shared/lib/modelCapabilities";
import type {
  LibraryFilter,
  LibraryItem,
  LibraryItemsPage,
  SpeechModel,
} from "../../../types";
import {
  getFileExtension,
  SUPPORTED_EXTENSIONS,
} from "../shared/library-utils";

const ACTIVE_LIBRARY_STATES = new Set([
  "active",
  "recording",
  "transcribing",
  "importing",
  "pending",
  "cancelling",
]);

export type LibraryStatusChoice = "active" | "complete" | "error";

export type LibraryModelSelection = {
  installed: SpeechModel[];
  meeting: SpeechModel[];
  liveMeeting: SpeechModel[];
  detailDefault?: string;
  importDefault?: string;
  meetingDefault?: string;
};

export function libraryFilter(search: string, status: string): LibraryFilter {
  return {
    search: search || null,
    status: status === "all" ? null : status,
    tag: null,
    since_days: null,
  };
}

export function libraryItemsFromPages(
  pages: LibraryItemsPage[] | undefined,
): LibraryItem[] {
  return pages?.flatMap(({ items }) => items) ?? [];
}

export function selectedLibraryItem(
  items: LibraryItem[],
  selectedId: string | null,
): LibraryItem | null {
  if (!selectedId) return null;
  return items.find(({ id }) => id === selectedId) ?? null;
}

export function displayedStatusChoice(
  status: string,
): "all" | LibraryStatusChoice {
  if (ACTIVE_LIBRARY_STATES.has(status)) return "active";
  if (status === "complete" || status === "error") return status;
  return "all";
}

export function nextStatusFilter(
  currentStatus: string,
  choice: LibraryStatusChoice,
): string {
  return displayedStatusChoice(currentStatus) === choice ? "all" : choice;
}

export function editNamePatch(
  items: LibraryItem[],
  id: string,
  draft: string,
): { name: string } | null {
  const name = draft.trim();
  const currentName = items.find((item) => item.id === id)?.name ?? "";
  return name && name !== currentName ? { name } : null;
}

export function appendTagPatch(
  items: LibraryItem[],
  id: string,
  draft: string,
): { tags: string[] } | null {
  const tag = draft.trim();
  if (!tag) return null;
  const item = items.find((candidate) => candidate.id === id);
  if (!item) return null;
  const duplicate = item.tags.some(
    (existing) => existing.toLowerCase() === tag.toLowerCase(),
  );
  return duplicate ? null : { tags: [...item.tags, tag] };
}

export function removeTagPatch(
  item: LibraryItem,
  tag: string,
): { tags: string[] } {
  return { tags: item.tags.filter((existing) => existing !== tag) };
}

export function selectLibraryModels(
  models: SpeechModel[],
  configuredKey: string,
): LibraryModelSelection {
  const installed = models.filter(({ installed: ready }) => ready);
  const meeting = installed.filter(
    (model) =>
      model.remote || hasModelCapability(model, MODEL_CAPABILITY_TIMESTAMPS),
  );
  const liveMeeting = installed.filter(
    (model) =>
      !model.remote &&
      model.engine_id === "nvidia" &&
      hasModelCapability(model, MODEL_CAPABILITY_TIMESTAMPS),
  );
  const configuredMeeting = meeting.find(({ key }) => key === configuredKey);
  const configuredInstalled = installed.find(
    ({ key }) => key === configuredKey,
  );
  const localMeeting = meeting.find(({ remote }) => !remote);
  const remoteMeeting = meeting.find(({ remote }) => remote);

  return {
    installed,
    meeting,
    liveMeeting,
    detailDefault:
      configuredMeeting?.id ?? localMeeting?.id ?? remoteMeeting?.id,
    importDefault:
      installed.find(({ remote }) => remote)?.id ??
      configuredInstalled?.id ??
      installed[0]?.id,
    meetingDefault:
      meeting.find(({ remote, key }) => !remote && key === configuredKey)?.id ??
      localMeeting?.id ??
      remoteMeeting?.id,
  };
}

export function partitionImportPaths(paths: string[]) {
  const supported: string[] = [];
  const unsupported: string[] = [];
  paths.forEach((path) => {
    const destination = SUPPORTED_EXTENSIONS.includes(getFileExtension(path))
      ? supported
      : unsupported;
    destination.push(path);
  });
  return { supported, unsupported };
}

export function libraryErrorMessage(error: unknown): string | null {
  if (error == null) return null;
  return error instanceof Error ? error.message : String(error);
}
