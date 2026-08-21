import { getMeetingCaptureState } from "../../data/library";
import { searchMemory } from "../../data/memory";
import { getLocalSnippets } from "../../data/snippets-sync";
import type { FeatureDiagnostic } from "../../features/feature-lab/types";
import type { StoredSettings } from "../../types";

type DiagnosticCollection = PromiseSettledResult<unknown[]>;

function fulfilledItemCount(result: DiagnosticCollection): number | null {
  return result.status === "fulfilled" ? result.value.length : null;
}

function workflowDiagnostic(
  settings: StoredSettings | undefined,
): FeatureDiagnostic {
  const workflowCount = settings?.mode_rules.length;
  return {
    id: "workflows",
    label: "Workflows v2",
    detail:
      workflowCount === undefined
        ? "Settings are not available. Restart Looper, then open Settings and retry."
        : `${workflowCount} workflow${workflowCount === 1 ? "" : "s"} loaded from local settings.`,
    status: settings ? "pass" : "fail",
  };
}

function snippetsDiagnostic(result: DiagnosticCollection): FeatureDiagnostic {
  const snippetCount = fulfilledItemCount(result);
  return {
    id: "snippets",
    label: "Dynamic snippets",
    detail:
      snippetCount === null
        ? "The snippets backend did not respond. Open Voice → Snippets, then retry."
        : `${snippetCount} snippet${snippetCount === 1 ? "" : "s"} loaded from local storage.`,
    status: snippetCount === null ? "fail" : "pass",
  };
}

function memoryDiagnostic(result: DiagnosticCollection): FeatureDiagnostic {
  const matchCount = fulfilledItemCount(result);
  return {
    id: "memory",
    label: "Looper Memory",
    detail:
      matchCount === null
        ? "The local Memory index did not respond. Open Memory once, then retry."
        : `The local index responded${matchCount > 0 ? " with at least one result" : " and is currently empty"}.`,
    status: matchCount === null ? "fail" : "pass",
  };
}

function meetingDiagnostic(
  result: PromiseSettledResult<
    Awaited<ReturnType<typeof getMeetingCaptureState>>
  >,
): FeatureDiagnostic {
  const backendAvailable = result.status === "fulfilled";
  return {
    id: "meeting",
    label: "Live meeting transcript",
    detail: backendAvailable
      ? `Capture backend responded with phase “${result.value.phase}”.`
      : "The meeting capture backend did not respond. Check microphone permission in Settings, then retry.",
    status: backendAvailable ? "pass" : "fail",
  };
}

function privacyDiagnostic(
  settings: StoredSettings | undefined,
): FeatureDiagnostic {
  return {
    id: "privacy-markdown",
    label: "Overlay privacy + Markdown mirror",
    detail: settings
      ? `Capture protection ${settings.hide_overlays_from_capture ? "enabled" : "available"}; Markdown mirror ${settings.markdown_mirror_enabled ? "enabled" : "available"}.`
      : "Settings are not available. Restart Looper, then retry.",
    status: settings ? "pass" : "fail",
  };
}

const manualDiagnostics: FeatureDiagnostic[] = [
  {
    id: "insertion",
    label: "Insertion + deterministic formatting",
    detail: "Use the dictation field above with a real Looper shortcut.",
    status: "manual",
  },
  {
    id: "mcp",
    label: "MCP read-only",
    detail:
      "Run the looper mcp handshake from a client; the native suite verifies the read-only tool contracts.",
    status: "manual",
  },
  {
    id: "mobile-stt",
    label: "Mobile Local STT",
    detail:
      "The 100-run evidence gate must run from Mobile Feature Lab on physical iOS and Android devices.",
    status: "manual",
  },
];

export function createHomeDiagnostics(
  settings: StoredSettings | undefined,
): () => Promise<FeatureDiagnostic[]> {
  return async () => {
    const [snippets, memory, meeting] = await Promise.allSettled([
      getLocalSnippets(),
      searchMemory({ query: "", sources: [], limit: 1 }),
      getMeetingCaptureState(),
    ]);
    const [insertion, mcp, mobileStt] = manualDiagnostics;

    return [
      workflowDiagnostic(settings),
      insertion,
      snippetsDiagnostic(snippets),
      memoryDiagnostic(memory),
      meetingDiagnostic(meeting),
      privacyDiagnostic(settings),
      mcp,
      mobileStt,
    ];
  };
}
