import Foundation

typealias ByokSpeechTransport = (URLRequest) async throws -> (Data, URLResponse)

struct ByokSpeechProviderPlan {
    enum WireFormat {
        case whisperMultipart
        case gemini
        case azureSpeech
    }

    let wireFormat: WireFormat
    let endpoint: String
    let model: String
    let azureRegion: String?

    static func resolve(
        provider: String,
        baseUrl: String?,
        modelOverride: String?,
        azureRegion: String?
    ) -> Self {
        let trimmedBase = baseUrl?.trimmingCharacters(in: CharacterSet(charactersIn: "/"))

        switch provider {
        case "groq":
            return .init(
                wireFormat: .whisperMultipart,
                endpoint: "https://api.groq.com/openai/v1/audio/transcriptions",
                model: modelOverride ?? "whisper-large-v3",
                azureRegion: azureRegion
            )
        case "speaches":
            return .init(
                wireFormat: .whisperMultipart,
                endpoint: "\(trimmedBase ?? "")/v1/audio/transcriptions",
                model: modelOverride ?? "whisper-large-v3",
                azureRegion: azureRegion
            )
        case "openaiCompatible":
            return .init(
                wireFormat: .whisperMultipart,
                endpoint: "\(trimmedBase ?? "")/audio/transcriptions",
                model: modelOverride ?? "whisper-1",
                azureRegion: azureRegion
            )
        case "ollama":
            let host = trimmedBase ?? "http://localhost:11434"
            return .init(
                wireFormat: .whisperMultipart,
                endpoint: "\(host)/v1/audio/transcriptions",
                model: modelOverride ?? "whisper-1",
                azureRegion: azureRegion
            )
        case "gemini":
            return .init(
                wireFormat: .gemini,
                endpoint: "",
                model: modelOverride ?? "gemini-2.0-flash",
                azureRegion: azureRegion
            )
        case "azure":
            return .init(
                wireFormat: .azureSpeech,
                endpoint: "",
                model: modelOverride ?? "",
                azureRegion: azureRegion
            )
        default:
            return .init(
                wireFormat: .whisperMultipart,
                endpoint: "https://api.openai.com/v1/audio/transcriptions",
                model: modelOverride ?? "whisper-1",
                azureRegion: azureRegion
            )
        }
    }
}

struct ByokMultipartBody {
    private let boundary: String
    private(set) var bytes = Data()

    init(boundary: String) {
        self.boundary = boundary
    }

    mutating func appendAudio(_ audio: Data) {
        append("--\(boundary)\r\n")
        append("Content-Disposition: form-data; name=\"file\"; filename=\"audio.m4a\"\r\n")
        append("Content-Type: audio/mp4\r\n\r\n")
        bytes.append(audio)
        append("\r\n")
    }

    mutating func appendField(name: String, value: String) {
        append("--\(boundary)\r\n")
        append("Content-Disposition: form-data; name=\"\(name)\"\r\n\r\n")
        append("\(value)\r\n")
    }

    mutating func finish() {
        append("--\(boundary)--\r\n")
    }

    private mutating func append(_ text: String) {
        bytes.append(text.data(using: .utf8)!)
    }
}

struct ByokSpeechRequestFactory {
    let credential: String
    let plan: ByokSpeechProviderPlan

    func make(audio: Data, prompt: String?, language: String?) throws -> URLRequest {
        switch plan.wireFormat {
        case .whisperMultipart:
            return try whisperRequest(audio: audio, prompt: prompt, language: language)
        case .gemini:
            return try geminiRequest(audio: audio, prompt: prompt)
        case .azureSpeech:
            return try azureRequest(audio: audio, language: language)
        }
    }

    private func post(urlString: String, headers: [String: String]) throws -> URLRequest {
        guard let url = URL(string: urlString) else { throw ApiError.invalidURL }
        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        for (field, value) in headers {
            request.setValue(value, forHTTPHeaderField: field)
        }
        return request
    }

    private func whisperRequest(audio: Data, prompt: String?, language: String?) throws -> URLRequest {
        let boundary = UUID().uuidString
        var form = ByokMultipartBody(boundary: boundary)
        form.appendAudio(audio)
        form.appendField(name: "model", value: plan.model)
        form.appendField(name: "response_format", value: "text")
        if let prompt { form.appendField(name: "prompt", value: prompt) }
        if let language { form.appendField(name: "language", value: language) }
        form.finish()

        var request = try post(
            urlString: plan.endpoint,
            headers: [
                "Authorization": "Bearer \(credential)",
                "Content-Type": "multipart/form-data; boundary=\(boundary)",
            ]
        )
        request.httpBody = form.bytes
        return request
    }

    private func geminiRequest(audio: Data, prompt: String?) throws -> URLRequest {
        let instruction: String
        if let prompt, !prompt.isEmpty {
            instruction =
                "Transcribe this audio exactly. Use these terms if you hear them: \(prompt). Output only the transcription text."
        } else {
            instruction = "Transcribe this audio exactly. Output only the transcription text."
        }
        let endpoint =
            "https://generativelanguage.googleapis.com/v1beta/models/\(plan.model):generateContent?key=\(credential)"
        let body: [String: Any] = [
            "contents": [
                [
                    "parts": [
                        ["inline_data": ["mime_type": "audio/mp4", "data": audio.base64EncodedString()]],
                        ["text": instruction],
                    ]
                ]
            ]
        ]

        var request = try post(urlString: endpoint, headers: ["Content-Type": "application/json"])
        request.httpBody = try JSONSerialization.data(withJSONObject: body)
        return request
    }

    private func azureRequest(audio: Data, language: String?) throws -> URLRequest {
        let region = plan.azureRegion ?? "eastus"
        let locale = language.flatMap { $0.isEmpty ? nil : $0 } ?? "en-US"
        let endpoint =
            "https://\(region).stt.speech.microsoft.com/speech/recognition/conversation/cognitiveservices/v1?language=\(locale)&format=detailed"
        var request = try post(
            urlString: endpoint,
            headers: [
                "Ocp-Apim-Subscription-Key": credential,
                "Content-Type": "audio/mp4",
                "Accept": "application/json",
            ]
        )
        request.httpBody = audio
        return request
    }
}

enum ByokSpeechResponseDecoder {
    static func decode(_ data: Data, format: ByokSpeechProviderPlan.WireFormat) throws -> String {
        switch format {
        case .whisperMultipart:
            guard let text = String(data: data, encoding: .utf8)?.trimmingCharacters(in: .whitespacesAndNewlines),
                !text.isEmpty
            else {
                throw ApiError.parseError
            }
            return text
        case .gemini:
            return try geminiText(in: data).trimmingCharacters(in: .whitespacesAndNewlines)
        case .azureSpeech:
            return try azureText(in: data).trimmingCharacters(in: .whitespacesAndNewlines)
        }
    }

    private static func jsonObject(in data: Data) throws -> [String: Any] {
        guard let value = try JSONSerialization.jsonObject(with: data) as? [String: Any] else {
            throw ApiError.parseError
        }
        return value
    }

    private static func geminiText(in data: Data) throws -> String {
        let root = try jsonObject(in: data)
        let candidates = root["candidates"] as? [[String: Any]]
        let content = candidates?.first?["content"] as? [String: Any]
        let parts = content?["parts"] as? [[String: Any]]
        guard let text = parts?.first?["text"] as? String else { throw ApiError.parseError }
        return text
    }

    private static func azureText(in data: Data) throws -> String {
        let root = try jsonObject(in: data)
        guard let text = root["DisplayText"] as? String else { throw ApiError.parseError }
        return text
    }
}

// Audio remains provider-bound in BYOK mode; segmentation and retries stay in
// BaseTranscribeAudioRepo so each segment keeps the existing retry policy.
class ByokTranscribeAudioRepo: BaseTranscribeAudioRepo {
    private let plan: ByokSpeechProviderPlan
    private let requestFactory: ByokSpeechRequestFactory
    private let transport: ByokSpeechTransport

    init(
        apiKey: String,
        provider: String,
        baseUrl: String?,
        modelOverride: String? = nil,
        azureRegion: String? = nil
    ) {
        let plan = ByokSpeechProviderPlan.resolve(
            provider: provider,
            baseUrl: baseUrl,
            modelOverride: modelOverride,
            azureRegion: azureRegion
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
        azureRegion: String? = nil,
        transport: @escaping ByokSpeechTransport
    ) {
        let plan = ByokSpeechProviderPlan.resolve(
            provider: provider,
            baseUrl: baseUrl,
            modelOverride: modelOverride,
            azureRegion: azureRegion
        )
        self.plan = plan
        self.requestFactory = .init(credential: apiKey, plan: plan)
        self.transport = transport
    }

    override func transcribeSegment(
        audioData: Data,
        prompt: String?,
        language: String?
    ) async throws -> String {
        let request = try requestFactory.make(audio: audioData, prompt: prompt, language: language)
        let (data, response) = try await transport(request)
        try Self.validate(response: response, body: data)
        return try ByokSpeechResponseDecoder.decode(data, format: plan.wireFormat)
    }

    private static func validate(response: URLResponse, body: Data) throws {
        let status = (response as? HTTPURLResponse)?.statusCode ?? -1
        guard (200...299).contains(status) else {
            throw ApiError.httpError(status, String(data: body, encoding: .utf8) ?? "")
        }
    }
}
