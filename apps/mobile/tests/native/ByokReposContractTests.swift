import Foundation

private struct ContractFailure: Error, CustomStringConvertible {
    let description: String
}

private enum TransientFailure: Error {
    case offline
}

private actor AttemptCounter {
    private var count = 0

    func increment() -> Int {
        count += 1
        return count
    }

    func value() -> Int {
        count
    }
}

private func require(_ condition: @autoclosure () -> Bool, _ message: String) throws {
    guard condition() else { throw ContractFailure(description: message) }
}

private func response(for request: URLRequest, status: Int = 200) throws -> HTTPURLResponse {
    guard let url = request.url,
        let response = HTTPURLResponse(
            url: url,
            statusCode: status,
            httpVersion: "HTTP/1.1",
            headerFields: nil
        )
    else {
        throw ContractFailure(description: "Could not create the test HTTP response")
    }
    return response
}

private func jsonBody(of request: URLRequest) throws -> [String: Any] {
    guard let data = request.httpBody,
        let object = try JSONSerialization.jsonObject(with: data) as? [String: Any]
    else {
        throw ContractFailure(description: "Expected a JSON object request body")
    }
    return object
}

private func assertTextProviderDefaults() throws {
    let cases: [(String, String?, String, String)] = [
        ("groq", nil, "https://api.groq.com/openai/v1/chat/completions", "llama-3.3-70b-versatile"),
        ("deepseek", nil, "https://api.deepseek.com/chat/completions", "deepseek-chat"),
        ("openRouter", nil, "https://openrouter.ai/api/v1/chat/completions", "openai/gpt-4o-mini"),
        ("cerebras", nil, "https://api.cerebras.ai/v1/chat/completions", "llama-3.3-70b"),
        ("ollama", nil, "http://localhost:11434/v1/chat/completions", "llama3"),
        ("claude", nil, "https://api.anthropic.com/v1/messages", "claude-sonnet-4-20250514"),
        ("unknown", nil, "https://api.openai.com/v1/chat/completions", "gpt-4o-mini"),
    ]

    for item in cases {
        let plan = ByokTextProviderPlan.resolve(
            provider: item.0,
            baseUrl: item.1,
            modelOverride: nil
        )
        try require(plan.endpoint == item.2, "Unexpected text endpoint for \(item.0)")
        try require(plan.model == item.3, "Unexpected text model for \(item.0)")
    }

    let custom = ByokTextProviderPlan.resolve(
        provider: "openaiCompatible",
        baseUrl: "https://llm.example/v2///",
        modelOverride: "owned-model"
    )
    try require(custom.endpoint == "https://llm.example/v2/chat/completions", "Custom text base URL changed")
    try require(custom.model == "owned-model", "Custom text model changed")
}

private func assertChatRequestAndResponse() async throws {
    let repo = ByokGenerateTextRepo(
        apiKey: "user-key",
        provider: "openaiCompatible",
        baseUrl: "https://llm.example/v2/",
        modelOverride: "owned-model"
    ) { request in
        try require(request.url?.absoluteString == "https://llm.example/v2/chat/completions", "Chat URL changed")
        try require(request.value(forHTTPHeaderField: "Authorization") == "Bearer user-key", "Bearer header changed")
        try require(
            request.value(forHTTPHeaderField: "Content-Type") == "application/json", "Chat content type changed")

        let body = try jsonBody(of: request)
        try require(body["model"] as? String == "owned-model", "Chat model field changed")
        let messages = body["messages"] as? [[String: Any]]
        try require(messages?.count == 2, "Chat message count changed")
        try require(messages?.first?["role"] as? String == "system", "System role changed")
        try require(messages?.first?["content"] as? String == "system rules", "System content changed")
        try require(messages?.last?["content"] as? String == "user prompt", "User content changed")
        let responseFormat = body["response_format"] as? [String: String]
        try require(responseFormat?["type"] == "json_object", "JSON response format changed")

        return (Data("{\"choices\":[{\"message\":{\"content\":\"  raw chat  \"}}]}".utf8), try response(for: request))
    }

    let result = try await repo.generateText(
        system: "system rules",
        prompt: "user prompt",
        jsonResponse: ["schema": "ignored by wire"]
    )
    try require(result == "  raw chat  ", "Chat response must remain untrimmed")
}

private func assertGeminiTextContract() async throws {
    let repo = ByokGenerateTextRepo(
        apiKey: "gem-key",
        provider: "gemini",
        baseUrl: nil
    ) { request in
        let expected =
            "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=gem-key"
        try require(request.url?.absoluteString == expected, "Gemini generation URL changed")
        let body = try jsonBody(of: request)
        let instruction = body["system_instruction"] as? [String: [[String: String]]]
        try require(instruction?["parts"]?.first?["text"] == "be concise", "Gemini system instruction changed")
        let generation = body["generationConfig"] as? [String: String]
        try require(generation?["responseMimeType"] == "application/json", "Gemini JSON mode changed")
        return (
            Data(#"{"candidates":[{"content":{"parts":[{"text":"  gemini  "}]}}]}"#.utf8), try response(for: request)
        )
    }

    let result = try await repo.generateText(system: "be concise", prompt: "hello", jsonResponse: [:])
    try require(result == "gemini", "Gemini response must be trimmed")
}

private func assertAnthropicAndAzureContracts() async throws {
    let anthropic = ByokGenerateTextRepo(
        apiKey: "anthropic-key",
        provider: "claude",
        baseUrl: nil
    ) { request in
        try require(
            request.value(forHTTPHeaderField: "x-api-key") == "anthropic-key", "Anthropic API key header changed")
        try require(request.value(forHTTPHeaderField: "anthropic-version") == "2023-06-01", "Anthropic version changed")
        let body = try jsonBody(of: request)
        try require(body["max_tokens"] as? Int == 4096, "Anthropic token limit changed")
        try require(body["system"] as? String == "rules", "Anthropic system field changed")
        return (Data("{\"content\":[{\"text\":\"claude\"}]}".utf8), try response(for: request))
    }
    let anthropicText = try await anthropic.generateText(system: "rules", prompt: "hello")
    try require(anthropicText == "claude", "Anthropic decoder changed")

    let azure = ByokGenerateTextRepo(
        apiKey: "azure-key",
        provider: "azure",
        baseUrl: "https://owned.openai.azure.com/",
        modelOverride: "deployment-a"
    ) { request in
        let expected =
            "https://owned.openai.azure.com/openai/deployments/deployment-a/chat/completions?api-version=2024-08-01-preview"
        try require(request.url?.absoluteString == expected, "Azure OpenAI deployment URL changed")
        try require(request.value(forHTTPHeaderField: "api-key") == "azure-key", "Azure OpenAI key header changed")
        let body = try jsonBody(of: request)
        try require(body["model"] == nil, "Azure OpenAI must not send model in its body")
        return (Data("{\"choices\":[{\"message\":{\"content\":\"azure\"}}]}".utf8), try response(for: request))
    }
    let azureText = try await azure.generateText(system: nil, prompt: "hello")
    try require(azureText == "azure", "Azure OpenAI decoder changed")
}

private func assertTextErrorAndRetryContracts() async throws {
    let failing = ByokGenerateTextRepo(apiKey: "key", provider: "openai", baseUrl: nil) { request in
        (Data("quota".utf8), try response(for: request, status: 429))
    }
    do {
        _ = try await failing.generateText(system: nil, prompt: "hello")
        throw ContractFailure(description: "Expected an HTTP generation error")
    } catch ApiError.httpError(let code, let body) {
        try require(code == 429 && body == "quota", "Generation HTTP error lost status or body")
    }

    let attempts = AttemptCounter()
    let retrying = ByokGenerateTextRepo(apiKey: "key", provider: "openai", baseUrl: nil) { request in
        if await attempts.increment() == 1 { throw TransientFailure.offline }
        return (Data("{\"choices\":[{\"message\":{\"content\":\"retried\"}}]}".utf8), try response(for: request))
    }
    let retryResult = try await retrying.generate(system: nil, prompt: "hello")
    try require(retryResult == "retried", "Base generation retry changed")
    let finalAttempts = await attempts.value()
    try require(finalAttempts == 2, "Base generation must retry a failed request")
}

private func assertSpeechProviderDefaults() throws {
    let cases: [(String, String?, String, String)] = [
        ("groq", nil, "https://api.groq.com/openai/v1/audio/transcriptions", "whisper-large-v3"),
        ("speaches", "https://speech.example/", "https://speech.example/v1/audio/transcriptions", "whisper-large-v3"),
        ("openaiCompatible", "https://speech.example/", "https://speech.example/audio/transcriptions", "whisper-1"),
        ("ollama", nil, "http://localhost:11434/v1/audio/transcriptions", "whisper-1"),
        ("unknown", nil, "https://api.openai.com/v1/audio/transcriptions", "whisper-1"),
    ]

    for item in cases {
        let plan = ByokSpeechProviderPlan.resolve(
            provider: item.0,
            baseUrl: item.1,
            modelOverride: nil,
            azureRegion: nil
        )
        try require(plan.endpoint == item.2, "Unexpected speech endpoint for \(item.0)")
        try require(plan.model == item.3, "Unexpected speech model for \(item.0)")
    }
}

private func assertWhisperMultipartContract() async throws {
    let audio = Data("AUDIO-BYTES".utf8)
    let repo = ByokTranscribeAudioRepo(
        apiKey: "speech-key",
        provider: "groq",
        baseUrl: nil
    ) { request in
        try require(
            request.value(forHTTPHeaderField: "Authorization") == "Bearer speech-key", "Speech bearer header changed")
        let contentType = request.value(forHTTPHeaderField: "Content-Type") ?? ""
        try require(contentType.hasPrefix("multipart/form-data; boundary="), "Speech multipart header changed")
        guard let body = request.httpBody.flatMap({ String(data: $0, encoding: .utf8) }) else {
            throw ContractFailure(description: "Expected UTF-8 multipart test body")
        }
        let markers = [
            "name=\"file\"; filename=\"audio.m4a\"",
            "Content-Type: audio/mp4",
            "AUDIO-BYTES",
            "name=\"model\"\r\n\r\nwhisper-large-v3",
            "name=\"response_format\"\r\n\r\ntext",
            "name=\"prompt\"\r\n\r\nproduct term",
            "name=\"language\"\r\n\r\nes",
        ]
        var cursor = body.startIndex
        for marker in markers {
            guard let range = body.range(of: marker, range: cursor..<body.endIndex) else {
                throw ContractFailure(description: "Missing or reordered multipart marker: \(marker)")
            }
            cursor = range.upperBound
        }
        return (Data("  transcript  \n".utf8), try response(for: request))
    }

    let result = try await repo.transcribeSegment(audioData: audio, prompt: "product term", language: "es")
    try require(result == "transcript", "Whisper text response must be trimmed")
}

private func assertGeminiSpeechContract() async throws {
    let audio = Data([0, 1, 2, 3])
    let repo = ByokTranscribeAudioRepo(
        apiKey: "gem-key",
        provider: "gemini",
        baseUrl: nil
    ) { request in
        let body = try jsonBody(of: request)
        let contents = body["contents"] as? [[String: Any]]
        let parts = contents?.first?["parts"] as? [[String: Any]]
        let inline = parts?.first?["inline_data"] as? [String: String]
        try require(inline?["mime_type"] == "audio/mp4", "Gemini speech MIME type changed")
        try require(inline?["data"] == audio.base64EncodedString(), "Gemini speech audio encoding changed")
        let expectedPrompt =
            "Transcribe this audio exactly. Use these terms if you hear them: Looper. Output only the transcription text."
        try require(parts?.last?["text"] as? String == expectedPrompt, "Gemini transcription prompt changed")
        return (
            Data(#"{"candidates":[{"content":{"parts":[{"text":"  voice  "}]}}]}"#.utf8), try response(for: request)
        )
    }

    let result = try await repo.transcribeSegment(audioData: audio, prompt: "Looper", language: "fr")
    try require(result == "voice", "Gemini speech response must be trimmed")
}

private func assertAzureSpeechAndErrorContracts() async throws {
    let audio = Data("AZURE-AUDIO".utf8)
    let azure = ByokTranscribeAudioRepo(
        apiKey: "azure-speech-key",
        provider: "azure",
        baseUrl: nil,
        azureRegion: "westus2"
    ) { request in
        let expected =
            "https://westus2.stt.speech.microsoft.com/speech/recognition/conversation/cognitiveservices/v1?language=en-US&format=detailed"
        try require(request.url?.absoluteString == expected, "Azure Speech URL or default locale changed")
        try require(
            request.value(forHTTPHeaderField: "Ocp-Apim-Subscription-Key") == "azure-speech-key",
            "Azure Speech key header changed")
        try require(
            request.value(forHTTPHeaderField: "Content-Type") == "audio/mp4", "Azure Speech content type changed")
        try require(
            request.value(forHTTPHeaderField: "Accept") == "application/json", "Azure Speech accept header changed")
        try require(request.httpBody == audio, "Azure Speech must receive raw audio bytes")
        return (Data("{\"DisplayText\":\"  azure speech  \"}".utf8), try response(for: request))
    }
    let azureText = try await azure.transcribeSegment(audioData: audio, prompt: "ignored", language: "")
    try require(azureText == "azure speech", "Azure Speech decoder changed")

    let failing = ByokTranscribeAudioRepo(apiKey: "key", provider: "openai", baseUrl: nil) { request in
        (Data("provider unavailable".utf8), try response(for: request, status: 503))
    }
    do {
        _ = try await failing.transcribeSegment(audioData: audio, prompt: nil, language: nil)
        throw ContractFailure(description: "Expected an HTTP transcription error")
    } catch ApiError.httpError(let code, let body) {
        try require(code == 503 && body == "provider unavailable", "Transcription HTTP error lost status or body")
    }
}

private func assertTranscriptionRetryContract() async throws {
    let attempts = AttemptCounter()
    let repo = ByokTranscribeAudioRepo(apiKey: "key", provider: "openai", baseUrl: nil) { request in
        if await attempts.increment() == 1 { throw TransientFailure.offline }
        return (Data("retried transcript".utf8), try response(for: request))
    }
    let audioFile = FileManager.default.temporaryDirectory
        .appendingPathComponent("looper-byok-retry-\(UUID().uuidString).m4a")
    try Data("short-audio".utf8).write(to: audioFile)
    defer { try? FileManager.default.removeItem(at: audioFile) }

    let result = try await repo.transcribe(audioFileURL: audioFile)
    try require(result == "retried transcript", "Base transcription retry changed")
    let finalAttempts = await attempts.value()
    try require(finalAttempts == 2, "Base transcription must retry a failed segment")
}

@main
private enum ByokReposContractTests {
    static func main() async throws {
        try assertTextProviderDefaults()
        try await assertChatRequestAndResponse()
        try await assertGeminiTextContract()
        try await assertAnthropicAndAzureContracts()
        try await assertTextErrorAndRetryContracts()
        try assertSpeechProviderDefaults()
        try await assertWhisperMultipartContract()
        try await assertGeminiSpeechContract()
        try await assertAzureSpeechAndErrorContracts()
        try await assertTranscriptionRetryContract()
        print("ByokReposContractTests: PASS (10 contract groups)")
    }
}
