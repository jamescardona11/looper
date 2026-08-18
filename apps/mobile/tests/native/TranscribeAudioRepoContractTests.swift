import Foundation

private struct ContractFailure: Error, CustomStringConvertible {
    let description: String
}

private func require(_ condition: @autoclosure () -> Bool, _ message: String) throws {
    guard condition() else { throw ContractFailure(description: message) }
}

private actor ActivityMeter {
    private var active = 0
    private var peak = 0

    func begin() {
        active += 1
        peak = max(peak, active)
    }

    func end() {
        active -= 1
    }

    func highestConcurrency() -> Int {
        peak
    }
}

private final class CapturingTranscribeRepo: BaseTranscribeAudioRepo {
    private(set) var receivedAudio: Data?
    private(set) var receivedPrompt: String?
    private(set) var receivedLanguage: String?

    override func transcribeSegment(
        audioData: Data,
        prompt: String?,
        language: String?
    ) async throws -> String {
        receivedAudio = audioData
        receivedPrompt = prompt
        receivedLanguage = language
        return "captured transcript"
    }
}

private func assertSegmentationContract() throws {
    let plan = AudioSegmentationPlan(segmentLength: 60, overlap: 5)
    try require(plan.shouldUseOriginalFile(duration: 60), "A 60-second file must stay whole")
    try require(plan.shouldUseOriginalFile(duration: .nan), "Unknown duration must stay whole")
    try require(!plan.shouldUseOriginalFile(duration: 61), "Long audio must be segmented")
    try require(
        plan.windows(for: 125) == [
            AudioSegmentWindow(start: 0, end: 60),
            AudioSegmentWindow(start: 55, end: 115),
            AudioSegmentWindow(start: 110, end: 125),
        ],
        "Segment windows or five-second overlap changed"
    )
}

private func assertBatchOrderingContract() async throws {
    let activity = ActivityMeter()
    let payloads = [Data([0]), Data([1]), Data([2])]
    let result = try await SegmentBatchRunner(capacity: 2).process(payloads) { payload in
        let value = payload.first!
        await activity.begin()
        try? await Task.sleep(nanoseconds: UInt64(3 - value) * 5_000_000)
        await activity.end()
        return String(value)
    }

    try require(result == ["0", "1", "2"], "Concurrent segments lost their input order")
    let peak = await activity.highestConcurrency()
    try require(peak == 2, "Batch capacity must remain two in this policy test")
}

private func assertTranscriptMergeContract() throws {
    let stitcher = TranscriptStitcher(wordSearchLimit: 20)
    try require(stitcher.combine([]) == "", "Empty fragments must produce empty text")
    try require(
        stitcher.combine(["  one fragment  "]) == "  one fragment  ",
        "A single result must remain byte-for-byte unchanged"
    )
    try require(
        stitcher.combine(["  Hello WORLD", "world from Looper  "]) == "Hello WORLD from Looper",
        "Overlap must be removed case-insensitively"
    )
    try require(
        stitcher.combine(["first thought", "second thought"]) == "first thought second thought",
        "Unrelated fragments must be separated by one space"
    )
    try require(
        stitcher.combine(["alpha beta", "beta", ""]) == "alpha beta",
        "Fully repeated and empty fragments must not add text"
    )
}

private func assertMediaTypeContract() throws {
    try require(
        AudioMediaType.detect(in: Data("RIFF1234WAVE".utf8)) == "audio/wav",
        "RIFF/WAVE payload must use the WAV media type"
    )
    try require(
        AudioMediaType.detect(in: Data("RIFF1234M4A!".utf8)) == "audio/mp4",
        "A partial RIFF header must fall back to MP4"
    )
    try require(
        AudioMediaType.detect(in: Data([0, 1, 2])) == "audio/mp4",
        "Short payloads must fall back to MP4"
    )
}

private func assertWholeFileContract() async throws {
    let emptyFile = FileManager.default.temporaryDirectory.appendingPathComponent(
        "looper-empty-audio-\(UUID().uuidString).m4a"
    )
    let audioFile = FileManager.default.temporaryDirectory.appendingPathComponent(
        "looper-short-audio-\(UUID().uuidString).m4a"
    )
    FileManager.default.createFile(atPath: emptyFile.path, contents: Data())
    try Data("short-audio".utf8).write(to: audioFile)
    defer {
        try? FileManager.default.removeItem(at: emptyFile)
        try? FileManager.default.removeItem(at: audioFile)
    }

    let repo = CapturingTranscribeRepo()
    do {
        _ = try await repo.transcribe(audioFileURL: emptyFile)
        throw ContractFailure(description: "Empty audio must fail")
    } catch TranscribeError.noAudioData {
        // Expected contract.
    }

    let transcript = try await repo.transcribe(
        audioFileURL: audioFile,
        prompt: "Prefer Looper",
        language: "es"
    )
    try require(transcript == "captured transcript", "Short audio result changed")
    try require(repo.receivedAudio == Data("short-audio".utf8), "Whole-file bytes changed")
    try require(repo.receivedPrompt == "Prefer Looper", "Prompt forwarding changed")
    try require(repo.receivedLanguage == "es", "Language forwarding changed")
}

private func assertCloudContract() async throws {
    let config = RepoConfig(functionUrl: "https://convex.example", idToken: "token")
    let audio = Data("RIFF1234WAVEaudio".utf8)
    var steps = [String]()

    let transport = CloudTranscriptionTransport(
        rawValue: { receivedConfig, kind, name, arguments in
            try require(receivedConfig.functionUrl == config.functionUrl, "Upload config changed")
            guard case .mutation = kind else {
                throw ContractFailure(description: "Upload URL must use a mutation")
            }
            try require(name == "upload:generateUploadUrl", "Upload mutation changed")
            try require(arguments.isEmpty, "Upload mutation must have no arguments")
            steps.append("destination")
            return "https://upload.example/file"
        },
        upload: { destination, payload, mediaType in
            try require(destination == "https://upload.example/file", "Upload destination changed")
            try require(payload == audio, "Uploaded bytes changed")
            try require(mediaType == "audio/wav", "Uploaded media type changed")
            steps.append("upload")
            return "storage-id"
        },
        objectValue: { receivedConfig, kind, name, arguments in
            try require(receivedConfig.idToken == config.idToken, "Action config changed")
            guard case .action = kind else {
                throw ContractFailure(description: "Transcription must use an action")
            }
            try require(name == "stt/transcribe:transcribe", "Transcription action changed")
            try require(arguments["audioStorageId"] as? String == "storage-id", "Storage ID changed")
            try require(arguments["provider"] as? String == "assemblyai", "Cloud provider changed")
            try require(arguments["model"] as? String == "universal-3-5-pro", "Cloud model changed")
            try require(arguments["language"] as? String == "es", "Cloud language changed")
            try require(arguments["prompt"] == nil, "Cloud action must not receive the prompt")
            steps.append("transcribe")
            return ["text": "  verbatim cloud result  "]
        }
    )

    let repo = CloudTranscribeAudioRepo(config: config, transport: transport)
    let text = try await repo.transcribeSegment(
        audioData: audio,
        prompt: "ignored by this backend",
        language: "es"
    )
    try require(text == "  verbatim cloud result  ", "Cloud text must remain untrimmed")
    try require(steps == ["destination", "upload", "transcribe"], "Cloud operation order changed")
}

private func assertCloudParseErrorContract() async throws {
    let transport = CloudTranscriptionTransport(
        rawValue: { _, _, _, _ in 42 },
        upload: { _, _, _ in "unreachable" },
        objectValue: { _, _, _, _ in ["text": "unreachable"] }
    )
    let repo = CloudTranscribeAudioRepo(
        config: RepoConfig(functionUrl: "https://convex.example", idToken: "token"),
        transport: transport
    )

    do {
        _ = try await repo.transcribeSegment(audioData: Data([1]), prompt: nil, language: nil)
        throw ContractFailure(description: "A non-string upload URL must fail")
    } catch ApiError.parseError {
        // Expected contract.
    }
}

@main
private enum TranscribeAudioRepoContractTests {
    static func main() async throws {
        try assertSegmentationContract()
        try await assertBatchOrderingContract()
        try assertTranscriptMergeContract()
        try assertMediaTypeContract()
        try await assertWholeFileContract()
        try await assertCloudContract()
        try await assertCloudParseErrorContract()
        print("TranscribeAudioRepoContractTests: PASS (7 contract groups)")
    }
}
