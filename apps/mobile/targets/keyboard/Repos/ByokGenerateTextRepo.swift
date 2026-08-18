import Foundation

typealias ByokTextTransport = (URLRequest) async throws -> (Data, URLResponse)

struct ByokTextProviderPlan {
    enum WireFormat {
        case chatCompletions
        case gemini
        case anthropic
        case azureOpenAI
    }

    let wireFormat: WireFormat
    let endpoint: String
    let model: String

    static func resolve(provider: String, baseUrl: String?, modelOverride: String?) -> Self {
        let trimmedBase = baseUrl?.trimmingCharacters(in: CharacterSet(charactersIn: "/"))

        switch provider {
        case "groq":
            return .init(
                wireFormat: .chatCompletions,
                endpoint: "https://api.groq.com/openai/v1/chat/completions",
                model: modelOverride ?? "llama-3.3-70b-versatile"
            )
        case "deepseek":
            return .init(
                wireFormat: .chatCompletions,
                endpoint: "https://api.deepseek.com/chat/completions",
                model: modelOverride ?? "deepseek-chat"
            )
        case "openRouter":
            return .init(
                wireFormat: .chatCompletions,
                endpoint: "https://openrouter.ai/api/v1/chat/completions",
                model: modelOverride ?? "openai/gpt-4o-mini"
            )
        case "openaiCompatible":
            return .init(
                wireFormat: .chatCompletions,
                endpoint: "\(trimmedBase ?? "")/chat/completions",
                model: modelOverride ?? "gpt-4o-mini"
            )
        case "cerebras":
            return .init(
                wireFormat: .chatCompletions,
                endpoint: "https://api.cerebras.ai/v1/chat/completions",
                model: modelOverride ?? "llama-3.3-70b"
            )
        case "ollama":
            let host = trimmedBase ?? "http://localhost:11434"
            return .init(
                wireFormat: .chatCompletions,
                endpoint: "\(host)/v1/chat/completions",
                model: modelOverride ?? "llama3"
            )
        case "gemini":
            return .init(wireFormat: .gemini, endpoint: "", model: modelOverride ?? "gemini-2.0-flash")
        case "claude":
            return .init(
                wireFormat: .anthropic,
                endpoint: "https://api.anthropic.com/v1/messages",
                model: modelOverride ?? "claude-sonnet-4-20250514"
            )
        case "azure":
            let deployment = modelOverride ?? "gpt-4o-mini"
            let resource = trimmedBase ?? ""
            return .init(
                wireFormat: .azureOpenAI,
                endpoint:
                    "\(resource)/openai/deployments/\(deployment)/chat/completions?api-version=2024-08-01-preview",
                model: deployment
            )
        default:
            return .init(
                wireFormat: .chatCompletions,
                endpoint: "https://api.openai.com/v1/chat/completions",
                model: modelOverride ?? "gpt-4o-mini"
            )
        }
    }
}

struct ByokTextRequestFactory {
    let credential: String
    let plan: ByokTextProviderPlan

    func make(system: String?, prompt: String, wantsJSON: Bool) throws -> URLRequest {
        switch plan.wireFormat {
        case .chatCompletions:
            return try chatRequest(system: system, prompt: prompt, wantsJSON: wantsJSON, azure: false)
        case .azureOpenAI:
            return try chatRequest(system: system, prompt: prompt, wantsJSON: wantsJSON, azure: true)
        case .gemini:
            return try geminiRequest(system: system, prompt: prompt, wantsJSON: wantsJSON)
        case .anthropic:
            return try anthropicRequest(system: system, prompt: prompt)
        }
    }

    private func request(urlString: String, headers: [String: String]) throws -> URLRequest {
        guard let url = URL(string: urlString) else { throw ApiError.invalidURL }
        var result = URLRequest(url: url)
        result.httpMethod = "POST"
        for (field, value) in headers {
            result.setValue(value, forHTTPHeaderField: field)
        }
        return result
    }

    private func chatRequest(system: String?, prompt: String, wantsJSON: Bool, azure: Bool) throws -> URLRequest {
        let authentication = azure ? ["api-key": credential] : ["Authorization": "Bearer \(credential)"]
        var result = try request(
            urlString: plan.endpoint,
            headers: authentication.merging(["Content-Type": "application/json"]) { current, _ in current }
        )

        var turns = [[String: Any]]()
        system.map { turns.append(["role": "system", "content": $0]) }
        turns.append(["role": "user", "content": prompt])

        var body: [String: Any] = ["messages": turns]
        if !azure { body["model"] = plan.model }
        if wantsJSON { body["response_format"] = ["type": "json_object"] }
        result.httpBody = try JSONSerialization.data(withJSONObject: body)
        return result
    }

    private func geminiRequest(system: String?, prompt: String, wantsJSON: Bool) throws -> URLRequest {
        let endpoint =
            "https://generativelanguage.googleapis.com/v1beta/models/\(plan.model):generateContent?key=\(credential)"
        var body: [String: Any] = ["contents": [["parts": [["text": prompt]]]]]
        if let system { body["system_instruction"] = ["parts": [["text": system]]] }
        if wantsJSON { body["generationConfig"] = ["responseMimeType": "application/json"] }

        var result = try request(urlString: endpoint, headers: ["Content-Type": "application/json"])
        result.httpBody = try JSONSerialization.data(withJSONObject: body)
        return result
    }

    private func anthropicRequest(system: String?, prompt: String) throws -> URLRequest {
        var body: [String: Any] = [
            "model": plan.model,
            "max_tokens": 4096,
            "messages": [["role": "user", "content": prompt]],
        ]
        if let system { body["system"] = system }

        var result = try request(
            urlString: plan.endpoint,
            headers: [
                "x-api-key": credential,
                "anthropic-version": "2023-06-01",
                "Content-Type": "application/json",
            ]
        )
        result.httpBody = try JSONSerialization.data(withJSONObject: body)
        return result
    }
}

enum ByokTextResponseDecoder {
    static func decode(_ data: Data, format: ByokTextProviderPlan.WireFormat) throws -> String {
        switch format {
        case .chatCompletions, .azureOpenAI:
            return try chatText(in: data)
        case .gemini:
            return try geminiText(in: data).trimmingCharacters(in: .whitespacesAndNewlines)
        case .anthropic:
            return try anthropicText(in: data)
        }
    }

    private static func object(in data: Data) throws -> [String: Any] {
        guard let value = try JSONSerialization.jsonObject(with: data) as? [String: Any] else {
            throw ApiError.parseError
        }
        return value
    }

    private static func chatText(in data: Data) throws -> String {
        let root = try object(in: data)
        let choices = root["choices"] as? [[String: Any]]
        let message = choices?.first?["message"] as? [String: Any]
        guard let text = message?["content"] as? String else { throw ApiError.parseError }
        return text
    }

    private static func geminiText(in data: Data) throws -> String {
        let root = try object(in: data)
        let candidates = root["candidates"] as? [[String: Any]]
        let content = candidates?.first?["content"] as? [String: Any]
        let parts = content?["parts"] as? [[String: Any]]
        guard let text = parts?.first?["text"] as? String else { throw ApiError.parseError }
        return text
    }

    private static func anthropicText(in data: Data) throws -> String {
        let root = try object(in: data)
        let content = root["content"] as? [[String: Any]]
        guard let text = content?.first?["text"] as? String else { throw ApiError.parseError }
        return text
    }
}

// BYOK intentionally talks directly to the account selected by the user; the
// cloud repository remains the only path through the Looper backend.
class ByokGenerateTextRepo: BaseGenerateTextRepo {
    private let plan: ByokTextProviderPlan
    private let requestFactory: ByokTextRequestFactory
    private let transport: ByokTextTransport

    init(apiKey: String, provider: String, baseUrl: String?, modelOverride: String? = nil) {
        let plan = ByokTextProviderPlan.resolve(
            provider: provider,
            baseUrl: baseUrl,
            modelOverride: modelOverride
        )
        self.plan = plan
        self.requestFactory = .init(credential: apiKey, plan: plan)
        self.transport = { try await URLSession.shared.data(for: $0) }
    }

    init(
        apiKey: String,
        provider: String,
        baseUrl: String?,
        modelOverride: String? = nil,
        transport: @escaping ByokTextTransport
    ) {
        let plan = ByokTextProviderPlan.resolve(
            provider: provider,
            baseUrl: baseUrl,
            modelOverride: modelOverride
        )
        self.plan = plan
        self.requestFactory = .init(credential: apiKey, plan: plan)
        self.transport = transport
    }

    override func generateText(
        system: String?,
        prompt: String,
        jsonResponse: [String: Any]? = nil
    ) async throws -> String {
        let request = try requestFactory.make(
            system: system,
            prompt: prompt,
            wantsJSON: jsonResponse != nil
        )
        let (data, response) = try await transport(request)
        try Self.validate(response: response, body: data)
        return try ByokTextResponseDecoder.decode(data, format: plan.wireFormat)
    }

    private static func validate(response: URLResponse, body: Data) throws {
        let status = (response as? HTTPURLResponse)?.statusCode ?? -1
        guard (200...299).contains(status) else {
            throw ApiError.httpError(status, String(data: body, encoding: .utf8) ?? "")
        }
    }
}
