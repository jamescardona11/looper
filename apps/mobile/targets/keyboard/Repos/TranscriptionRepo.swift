import Foundation

class TranscriptionRepo {
    private static let storageKey = "looper_transcriptions"
    private static let capacity = 50

    private struct Services {
        let defaults: UserDefaults?
        let container: URL?
        let files: FileManager
        let makeId: () -> String
        let now: () -> Date
        let didSave: () -> Void
    }

    private let services: Services

    convenience init() {
        self.init(
            defaults: UserDefaults(suiteName: DictationConstants.appGroupId),
            containerUrl: FileManager.default.containerURL(
                forSecurityApplicationGroupIdentifier: DictationConstants.appGroupId
            ),
            fileManager: .default,
            makeId: { UUID().uuidString },
            now: Date.init,
            didSave: { CounterRepo().incrementApp() }
        )
    }

    init(
        defaults: UserDefaults?,
        containerUrl: URL?,
        fileManager: FileManager,
        makeId: @escaping () -> String,
        now: @escaping () -> Date,
        didSave: @escaping () -> Void
    ) {
        services = Services(
            defaults: defaults,
            container: containerUrl,
            files: fileManager,
            makeId: makeId,
            now: now,
            didSave: didSave
        )
    }

    func save(
        text: String,
        rawTranscript: String,
        toneId: String?,
        toneName: String?,
        audioSourceUrl: URL
    ) {
        guard let defaults = services.defaults, let container = services.container else {
            return
        }

        let id = services.makeId()
        let audioPath = archiveAudio(id: id, source: audioSourceUrl, container: container)
        let record = makeRecord(
            id: id,
            text: text,
            rawTranscript: rawTranscript,
            toneId: toneId,
            toneName: toneName,
            audioPath: audioPath
        )
        let saved = prependAndTrim(
            record,
            existing: defaults.array(forKey: Self.storageKey) as? [[String: Any]] ?? []
        )
        defaults.set(saved, forKey: Self.storageKey)
        services.didSave()
    }

    func loadAll() -> [[String: Any]] {
        guard let stored = services.defaults?.array(forKey: Self.storageKey) else { return [] }
        return stored as? [[String: Any]] ?? []
    }

    private func archiveAudio(id: String, source: URL, container: URL) -> String? {
        let directory = container.appendingPathComponent("audio", isDirectory: true)
        try? services.files.createDirectory(
            at: directory,
            withIntermediateDirectories: true
        )
        let destination = directory.appendingPathComponent("\(id).m4a")
        do {
            try services.files.copyItem(at: source, to: destination)
            return destination.path
        } catch {
            NSLog("[LooperKB] Failed to copy audio: %@", error.localizedDescription)
            return nil
        }
    }

    private func makeRecord(
        id: String,
        text: String,
        rawTranscript: String,
        toneId: String?,
        toneName: String?,
        audioPath: String?
    ) -> [String: Any] {
        var record: [String: Any] = [
            "id": id,
            "text": text.trimmingCharacters(in: .whitespacesAndNewlines),
            "rawTranscript": rawTranscript,
            "createdAt": ISO8601DateFormatter().string(from: services.now()),
        ]
        ["toneId": toneId, "toneName": toneName, "audioPath": audioPath]
            .forEach { key, value in
                if let value { record[key] = value }
            }
        return record
    }

    private func prependAndTrim(
        _ record: [String: Any],
        existing: [[String: Any]]
    ) -> [[String: Any]] {
        var result = existing
        result.insert(record, at: 0)
        guard result.count > Self.capacity else { return result }

        result.dropFirst(Self.capacity).forEach { discarded in
            if let path = discarded["audioPath"] as? String {
                try? services.files.removeItem(atPath: path)
            }
        }
        return Array(result.prefix(Self.capacity))
    }
}
