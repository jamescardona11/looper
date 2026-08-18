import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";
import { rerootModules } from "../../test-support/meteredHarness";
import { api } from "../_generated/api";
import schema from "../schema";

const modules = rerootModules(
  (import.meta as unknown as { glob: (p: string) => Record<string, () => Promise<unknown>> }).glob(
    "../**/*.ts",
  ),
  "meetings",
);

async function signedInTest() {
  const t = convexTest(schema, modules);
  const userId = await t.run(async (ctx) => await ctx.db.insert("users", {}));
  return t.withIdentity({ subject: userId });
}

describe("meetings.sessions", () => {
  it("shares only an explicitly active text session in strict sequence", async () => {
    const as = await signedInTest();
    await as.mutation(api.meetings.sessions.startSession, {
      meetingId: "meeting-1",
      title: "Pricing",
      sharingEnabled: true,
    });
    await as.mutation(api.meetings.sessions.appendTranscript, {
      meetingId: "meeting-1",
      sequence: 1,
      timestampMs: 1200,
      speaker: "them",
      text: "We should decide pricing today.",
      status: "final",
    });
    await expect(
      as.mutation(api.meetings.sessions.appendTranscript, {
        meetingId: "meeting-1",
        sequence: 3,
        timestampMs: 1400,
        text: "A gap must fail.",
        status: "final",
      }),
    ).rejects.toThrow("Expected transcript sequence 2");

    const page = await as.query(api.meetings.sessions.getTranscriptSince, {
      meetingId: "meeting-1",
      afterSequence: 0,
    });
    expect(page.segments.map((segment: { sequence: number }) => segment.sequence)).toEqual([1]);
    expect(page.nextSequence).toBe(1);
  });

  it("fails closed after pause and returns only the authenticated user's data", async () => {
    const owner = await signedInTest();
    await owner.mutation(api.meetings.sessions.startSession, {
      meetingId: "private",
      title: "Private",
      sharingEnabled: true,
    });
    await owner.mutation(api.meetings.sessions.setSessionState, {
      meetingId: "private",
      state: "paused",
      sharingEnabled: false,
    });
    await expect(
      owner.mutation(api.meetings.sessions.appendTranscript, {
        meetingId: "private",
        sequence: 1,
        timestampMs: 0,
        text: "Do not leak this.",
        status: "partial",
      }),
    ).rejects.toThrow("Live transcript sharing is not active");
    expect(await owner.query(api.meetings.sessions.listActiveSessions, {})).toEqual([]);
  });

  it("resumes a paused session at its server-issued sequence", async () => {
    const as = await signedInTest();
    await as.mutation(api.meetings.sessions.startSession, {
      meetingId: "resume",
      title: "Resume",
      sharingEnabled: true,
    });
    await as.mutation(api.meetings.sessions.appendTranscript, {
      meetingId: "resume",
      sequence: 1,
      timestampMs: 1,
      text: "Before the pause.",
      status: "final",
    });
    await as.mutation(api.meetings.sessions.setSessionState, {
      meetingId: "resume",
      state: "paused",
      sharingEnabled: false,
    });
    const resumed = await as.mutation(api.meetings.sessions.startSession, {
      meetingId: "resume",
      title: "Resume",
      sharingEnabled: true,
    });
    expect(resumed.nextSequence).toBe(2);
    await as.mutation(api.meetings.sessions.appendTranscript, {
      meetingId: "resume",
      sequence: 2,
      timestampMs: 2,
      text: "After the pause.",
      status: "final",
    });
  });

  it("lists recent meetings for Library across active and ended states", async () => {
    const as = await signedInTest();
    await as.mutation(api.meetings.sessions.startSession, {
      meetingId: "ended",
      title: "Ended meeting",
      sharingEnabled: true,
    });
    await as.mutation(api.meetings.sessions.setSessionState, {
      meetingId: "ended",
      state: "ended",
      sharingEnabled: false,
    });
    await as.mutation(api.meetings.sessions.startSession, {
      meetingId: "active",
      title: "Active meeting",
      sharingEnabled: true,
    });

    const sessions = await as.query(api.meetings.sessions.listSessions, {});
    expect(sessions.map((session: { meetingId: string }) => session.meetingId).sort()).toEqual([
      "active",
      "ended",
    ]);
    expect(await as.query(api.meetings.sessions.listSessions, { limit: 1 })).toHaveLength(1);
  });

  it("keeps contexts and Markdown output requests attached to their meeting", async () => {
    const as = await signedInTest();
    await as.mutation(api.meetings.sessions.startSession, {
      meetingId: "planning",
      title: "Planning",
      sharingEnabled: true,
    });
    await as.mutation(api.meetings.sessions.addContext, {
      meetingId: "planning",
      kind: "note",
      title: "Customer notes",
      content: "The customer needs SSO before September.",
    });
    const contexts = await as.query(api.meetings.sessions.listContexts, { meetingId: "planning" });
    expect(contexts).toHaveLength(1);
    const outputId = await as.mutation(api.meetings.sessions.prepareMarkdownOutput, {
      meetingId: "planning",
      preview: "# Customer notes\n\nAdd SSO before September",
    });
    expect(
      await as.mutation(api.meetings.sessions.confirmMarkdownOutput, { outputId, approved: true }),
    ).toEqual({
      status: "confirmed",
    });
    await as.mutation(api.meetings.sessions.registerCompanionDevice, {
      meetingId: "planning",
      deviceId: "phone-1",
      name: "James's phone",
    });
    expect(
      await as.query(api.meetings.sessions.listConnectedDevices, { meetingId: "planning" }),
    ).toHaveLength(1);
  });

  it("claims a confirmed Markdown output once and retries only after a failed delivery", async () => {
    const as = await signedInTest();
    await as.mutation(api.meetings.sessions.startSession, {
      meetingId: "export",
      title: "Export",
      sharingEnabled: true,
    });
    const outputId = await as.mutation(api.meetings.sessions.prepareMarkdownOutput, {
      meetingId: "export",
      preview: "# Meeting notes",
    });
    await as.mutation(api.meetings.sessions.confirmMarkdownOutput, { outputId, approved: true });
    const first = await as.mutation(api.meetings.sessions.claimConfirmedMarkdownOutput, {
      claimId: "desktop-1",
    });
    expect(first?.outputId).toBe(outputId);
    expect(
      await as.mutation(api.meetings.sessions.claimConfirmedMarkdownOutput, {
        claimId: "desktop-2",
      }),
    ).toBeNull();
    await as.mutation(api.meetings.sessions.completeMarkdownOutputDelivery, {
      outputId,
      claimId: "desktop-1",
      delivered: false,
    });
    expect(
      (
        await as.mutation(api.meetings.sessions.claimConfirmedMarkdownOutput, {
          claimId: "desktop-2",
        })
      )?.outputId,
    ).toBe(outputId);
  });

  it("derives a bounded review from this meeting's transcript only", async () => {
    const as = await signedInTest();
    await as.mutation(api.meetings.sessions.startSession, {
      meetingId: "review",
      title: "Review",
      sharingEnabled: true,
    });
    for (const [sequence, text] of [
      [1, "Decision: ship the beta on Friday."],
      [2, "Action item: Ana owns the release notes."],
      [3, "Who will verify pricing?"],
    ] as const) {
      await as.mutation(api.meetings.sessions.appendTranscript, {
        meetingId: "review",
        sequence,
        timestampMs: sequence * 1000,
        text,
        status: "final",
      });
    }
    const brief = await as.query(api.meetings.sessions.getMeetingBrief, { meetingId: "review" });
    expect(brief.decisions).toHaveLength(1);
    expect(brief.tasks).toHaveLength(1);
    expect(brief.questions).toHaveLength(1);
  });

  it("searches transcript and contexts as meeting-scoped Memory evidence", async () => {
    const as = await signedInTest();
    await as.mutation(api.meetings.sessions.startSession, {
      meetingId: "memory",
      title: "Pricing memory",
      sharingEnabled: true,
    });
    await as.mutation(api.meetings.sessions.appendTranscript, {
      meetingId: "memory",
      sequence: 1,
      timestampMs: 0,
      text: "Pricing will move to annual contracts.",
      status: "final",
    });
    await as.mutation(api.meetings.sessions.addContext, {
      meetingId: "memory",
      kind: "note",
      title: "Customer pricing note",
      content: "Enterprise customers requested invoicing.",
    });
    const results = await as.query(api.meetings.sessions.searchMeetingMemory, {
      query: "pricing",
    });
    expect(results.map((item: { kind: string }) => item.kind)).toEqual(["transcript", "context"]);
  });

  it("answers only with evidence from the requested meeting", async () => {
    const as = await signedInTest();
    await as.mutation(api.meetings.sessions.startSession, {
      meetingId: "ask",
      title: "Ask",
      sharingEnabled: true,
    });
    await as.mutation(api.meetings.sessions.appendTranscript, {
      meetingId: "ask",
      sequence: 1,
      timestampMs: 0,
      text: "Ana owns the pricing rollout.",
      status: "final",
    });
    const answer = await as.query(api.meetings.sessions.askMeeting, {
      meetingId: "ask",
      question: "Who owns pricing?",
    });
    expect(answer.evidence).toEqual([
      { label: "Transcript #1", text: "Ana owns the pricing rollout." },
    ]);
  });
});
