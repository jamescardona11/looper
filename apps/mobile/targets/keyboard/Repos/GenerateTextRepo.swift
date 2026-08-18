import Foundation

class BaseGenerateTextRepo {
    func generateText(system: String?, prompt: String, jsonResponse: [String: Any]? = nil) async throws -> String {
        fatalError("Subclasses must override generateText")
    }

    func generate(system: String?, prompt: String, jsonResponse: [String: Any]? = nil) async throws -> String {
        try await withRetry {
            try await self.generateText(system: system, prompt: prompt, jsonResponse: jsonResponse)
        }
    }
}

// MARK: - Cloud Implementation

// Real backend wiring — verified against
// backend/convex/agent/{threads,messages,reply}.ts and shared with Android.
//
// There is still no stateless "prompt in, text out" action — generation is
// conversational/thread-based and the reply streams in asynchronously via
// `ctx.scheduler` (reply.ts) — but that's a real, drivable 4-step protocol,
// not a dead end:
//   1. `agent/threads:createThread` (mutation, `{title?}`) creates a
//      throwaway `agentThreads` row and returns its id as a bare string, not
//      a JSON object (same shape as `upload:generateUploadUrl`), so this goes
//      through `invokeHandlerRawValue`.
//   2. `agent/messages:addUserMessage` (mutation) with `{threadId, content}`
//      appends the user turn and schedules `agent/reply:replyToThread` —
//      it returns as soon as that row is written, well before the model
//      replies (its own return value is also a bare string, unused here).
//   3. `agent/messages:list` (query, `{threadId}`) is polled every ~500ms (up
//      to 20 times, ~10s) until an assistant message shows `status: "done"`
//      with non-empty content. Its `value` is a bare JSON array, so it also
//      goes through `invokeHandlerRawValue`. `status: "error"` (e.g. no
//      provider key configured server-side — see reply.ts) short-circuits
//      the poll instead of waiting out the full timeout for a reply that will
//      never arrive; anything else (no assistant row yet, or "streaming")
//      just keeps polling.
//   4. `agent/threads:deleteThread` (mutation) best-effort cleans up the
//      throwaway thread once done. This isn't cosmetic: `agentThreads` is the
//      same table backing the user's real chat list and the home-screen
//      widget's `latestThreadPreview` — an orphaned thread here would leak
//      into both. Failures are logged, not thrown (the transcript already
//      has its result by then).
//
// `system` has no equivalent arg in this protocol — the agent always replies
// under the backend's own fixed `SYSTEM_PROMPT` (reply.ts), so it's
// intentionally unused. `jsonResponse` is unused too: there's no
// `response_format` knob to set, but the caller's `prompt` already carries
// its own "respond in JSON" instruction (see `buildPostProcessingPrompt` in
// PromptUtils.swift), which the shared agent just sees as part of the
// message text.
//
// Confirmed end-to-end against a local Convex deployment
// (`http://127.0.0.1:3210`) with `MOCK_MODE=true`.
class CloudGenerateTextRepo: BaseGenerateTextRepo {
    private let config: RepoConfig

    init(config: RepoConfig) {
        self.config = config
    }

    override func generateText(system: String?, prompt: String, jsonResponse: [String: Any]? = nil) async throws -> String {
        let threadIdValue = try await invokeHandlerRawValue(
            config: config,
            kind: .mutation,
            name: "agent/threads:createThread",
            args: ["title": "Keyboard post-processing"]
        )
        guard let threadId = threadIdValue as? String else {
            throw ApiError.parseError
        }

        defer { deleteThreadBestEffort(threadId: threadId) }

        _ = try await invokeHandlerRawValue(
            config: config,
            kind: .mutation,
            name: "agent/messages:addUserMessage",
            args: ["threadId": threadId, "content": prompt]
        )

        return try await pollForAssistantReply(threadId: threadId)
    }

    private func pollForAssistantReply(threadId: String) async throws -> String {
        let pollIntervalNanos: UInt64 = 500_000_000
        let maxPollAttempts = 20

        for _ in 0..<maxPollAttempts {
            try await Task.sleep(nanoseconds: pollIntervalNanos)

            let messagesValue = try await invokeHandlerRawValue(
                config: config,
                kind: .query,
                name: "agent/messages:list",
                args: ["threadId": threadId]
            )
            guard let messages = messagesValue as? [[String: Any]] else {
                throw ApiError.parseError
            }

            guard let assistantMessage = messages.last(where: { ($0["role"] as? String) == "assistant" }) else {
                continue
            }

            let status = assistantMessage["status"] as? String ?? ""
            let content = assistantMessage["content"] as? String ?? ""

            if status == "done", !content.isEmpty {
                return content
            }
            if status == "error" {
                throw GenerateTextError.assistantError(content.isEmpty ? "Cloud text generation failed" : content)
            }
            // "streaming" (or no assistant row yet) — keep polling.
        }

        throw GenerateTextError.timeout(
            "Cloud text generation timed out waiting for the agent's reply after \(maxPollAttempts) polls."
        )
    }

    private func deleteThreadBestEffort(threadId: String) {
        let repoConfig = config
        Task {
            do {
                _ = try await invokeHandlerRawValue(
                    config: repoConfig,
                    kind: .mutation,
                    name: "agent/threads:deleteThread",
                    args: ["threadId": threadId]
                )
            } catch {
                NSLog("[LooperKB] agent/threads:deleteThread failed: %@", error.localizedDescription)
            }
        }
    }
}

// MARK: - Errors

enum GenerateTextError: Error, LocalizedError {
    case timeout(String)
    case assistantError(String)

    var errorDescription: String? {
        switch self {
        case .timeout(let msg): return msg
        case .assistantError(let msg): return msg
        }
    }
}
