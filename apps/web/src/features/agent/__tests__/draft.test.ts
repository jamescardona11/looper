import { beforeEach, describe, expect, it } from "vitest";
import { consumeAgentDraft, saveAgentDraft } from "../draft";

describe("agent draft handoff", () => {
  beforeEach(() => {
    sessionStorage.clear();
  });

  it("stores a trimmed draft for a specific thread", () => {
    saveAgentDraft("thread-a", "  Draft a launch plan  ");

    expect(consumeAgentDraft("thread-a")).toBe("Draft a launch plan");
  });

  it("consumes a draft only once", () => {
    saveAgentDraft("thread-a", "Summarize this");

    expect(consumeAgentDraft("thread-a")).toBe("Summarize this");
    expect(consumeAgentDraft("thread-a")).toBe("");
  });

  it("keeps drafts isolated by thread", () => {
    saveAgentDraft("thread-a", "First");
    saveAgentDraft("thread-b", "Second");

    expect(consumeAgentDraft("thread-b")).toBe("Second");
    expect(consumeAgentDraft("thread-a")).toBe("First");
  });

  it("does not store empty drafts", () => {
    saveAgentDraft("thread-a", "   ");

    expect(consumeAgentDraft("thread-a")).toBe("");
  });
});
