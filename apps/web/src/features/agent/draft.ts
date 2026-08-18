const DRAFT_PREFIX = "agent-draft:";

function draftKey(threadId: string) {
  return `${DRAFT_PREFIX}${threadId}`;
}

export function saveAgentDraft(threadId: string, value: string) {
  const draft = value.trim();
  if (!draft) return;

  sessionStorage.setItem(draftKey(threadId), draft);
}

export function consumeAgentDraft(threadId: string) {
  const key = draftKey(threadId);
  const draft = sessionStorage.getItem(key) ?? "";
  sessionStorage.removeItem(key);
  return draft;
}
