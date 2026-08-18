import Foundation

enum DictationConstants {
    static let appGroupId = "group.ai.telepatia.looper.keyboard-tests"
}

private enum PlannedFailure: Error {
    case retryable
}

private func require(_ condition: @autoclosure () -> Bool, _ message: String) throws {
    guard condition() else {
        throw NSError(domain: "KeyboardReposContractTests", code: 1, userInfo: [
            NSLocalizedDescriptionKey: message,
        ])
    }
}

private func testCounters() throws {
    let suite = "looper-keyboard-counters-\(UUID().uuidString)"
    let defaults = UserDefaults(suiteName: suite)!
    defer { defaults.removePersistentDomain(forName: suite) }
    let repo = CounterRepo(defaults: defaults)

    repo.incrementApp()
    repo.incrementApp()
    defaults.set(1, forKey: "looper_keyboard_update_counter")

    try require(repo.getKeyboard() == 1, "Keyboard counter direction changed")
    try require(
        defaults.integer(forKey: "looper_app_update_counter") == 2,
        "App counter storage key changed"
    )
    try require(
        CounterRepo(defaults: nil).getKeyboard() == 0,
        "Unavailable defaults must read zero"
    )
}

private func testTranscriptionHistory() throws {
    let suite = "looper-keyboard-history-\(UUID().uuidString)"
    let defaults = UserDefaults(suiteName: suite)!
    defer { defaults.removePersistentDomain(forName: suite) }
    let temp = try temporaryDirectory(named: "looper-keyboard-history")
    defer { try? FileManager.default.removeItem(at: temp) }
    let source = temp.appendingPathComponent("source.m4a")
    try Data([1, 2, 3, 4]).write(to: source)
    let date = Date(timeIntervalSince1970: 1_700_000_000)
    var identifier = "first"
    var notifications = 0
    let repo = TranscriptionRepo(
        defaults: defaults,
        containerUrl: temp,
        fileManager: .default,
        makeId: { identifier },
        now: { date },
        didSave: { notifications += 1 }
    )

    repo.save(
        text: "  clean text\n",
        rawTranscript: "raw text",
        toneId: "tone-1",
        toneName: "Clear",
        audioSourceUrl: source
    )

    func loadAll() -> [[String: Any]] {
        defaults.array(forKey: "looper_transcriptions") as? [[String: Any]] ?? []
    }

    let first = try requireFirst(loadAll())
    try require(first["id"] as? String == "first", "Generated transcription id changed")
    try require(first["text"] as? String == "clean text", "Text trimming changed")
    try require(first["rawTranscript"] as? String == "raw text", "Raw text changed")
    try require(first["toneId"] as? String == "tone-1", "Tone id was not retained")
    try require(first["toneName"] as? String == "Clear", "Tone name was not retained")
    try require(first["createdAt"] as? String == ISO8601DateFormatter().string(from: date), "Timestamp changed")
    let copiedPath = try requireString(first["audioPath"], "Copied audio path is missing")
    try require(FileManager.default.fileExists(atPath: copiedPath), "Audio was not copied")

    let discardedAudio = temp.appendingPathComponent("discarded.m4a")
    try Data([9]).write(to: discardedAudio)
    var existing = (0..<50).map { ["id": "old-\($0)"] as [String: Any] }
    existing[49]["audioPath"] = discardedAudio.path
    defaults.set(existing, forKey: "looper_transcriptions")
    identifier = "newest"
    repo.save(
        text: "new",
        rawTranscript: "new raw",
        toneId: nil,
        toneName: nil,
        audioSourceUrl: source
    )

    let capped = loadAll()
    try require(capped.count == 50, "History capacity changed")
    try require(capped.first?["id"] as? String == "newest", "Newest record is not first")
    try require(!FileManager.default.fileExists(atPath: discardedAudio.path), "Evicted audio remains")
    try require(notifications == 2, "Save notification count changed")
}

private func testRetryPolicy() async throws {
    var attempts = 0
    let value: String = try await withRetry(
        maxAttempts: 3,
        initialDelay: 0,
        backoffMultiplier: 4
    ) {
        attempts += 1
        if attempts < 3 { throw PlannedFailure.retryable }
        return "recovered"
    }
    try require(value == "recovered", "Retry did not return the successful value")
    try require(attempts == 3, "Retry attempt limit changed")

    attempts = 0
    do {
        let _: String = try await withRetry(maxAttempts: 2, initialDelay: 0) {
            attempts += 1
            throw PlannedFailure.retryable
        }
        throw NSError(domain: "KeyboardReposContractTests", code: 2)
    } catch PlannedFailure.retryable {
        try require(attempts == 2, "Final retry failure or attempt count changed")
    }
}

private func temporaryDirectory(named prefix: String) throws -> URL {
    let directory = FileManager.default.temporaryDirectory
        .appendingPathComponent("\(prefix)-\(UUID().uuidString)", isDirectory: true)
    try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
    return directory
}

private func requireFirst(_ records: [[String: Any]]) throws -> [String: Any] {
    guard let first = records.first else {
        throw NSError(domain: "KeyboardReposContractTests", code: 3)
    }
    return first
}

private func requireString(_ value: Any?, _ message: String) throws -> String {
    guard let value = value as? String else {
        throw NSError(domain: "KeyboardReposContractTests", code: 4, userInfo: [
            NSLocalizedDescriptionKey: message,
        ])
    }
    return value
}

@main
private enum KeyboardReposContractTests {
    static func main() async throws {
        try testCounters()
        try testTranscriptionHistory()
        try await testRetryPolicy()
        print("KeyboardReposContractTests: PASS (3 contract groups)")
    }
}
