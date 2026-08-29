import AVFoundation
import Foundation

struct AudioSegmentWindow: Equatable {
    let start: TimeInterval
    let end: TimeInterval
}

struct AudioSegmentationPlan {
    let segmentLength: TimeInterval
    let overlap: TimeInterval

    func shouldUseOriginalFile(duration: TimeInterval) -> Bool {
        !duration.isFinite || duration <= segmentLength
    }

    func windows(for duration: TimeInterval) -> [AudioSegmentWindow] {
        let advance = segmentLength - overlap
        var cursor: TimeInterval = 0
        var result = [AudioSegmentWindow]()

        while cursor < duration {
            let boundary = min(cursor + segmentLength, duration)
            result.append(AudioSegmentWindow(start: cursor, end: boundary))
            if boundary >= duration { break }
            cursor += advance
        }

        return result
    }
}

struct TranscriptStitcher {
    let wordSearchLimit: Int

    func combine(_ fragments: [String]) -> String {
        guard let first = fragments.first else { return "" }
        guard fragments.count > 1 else { return first }

        return fragments.reduce(into: "") { assembled, fragment in
            assembled = append(fragment, to: assembled)
        }
    }

    private func append(_ incoming: String, to existing: String) -> String {
        let left = existing.trimmingCharacters(in: .whitespacesAndNewlines)
        let right = incoming.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !left.isEmpty else { return right }
        guard !right.isEmpty else { return left }

        let leftWords = left.split(separator: " ").map(String.init)
        let rightWords = right.split(separator: " ").map(String.init)
        let possibleOverlap = min(leftWords.count, rightWords.count, wordSearchLimit)

        for length in stride(from: possibleOverlap, through: 1, by: -1) {
            let tail = leftWords.suffix(length).map { $0.lowercased() }
            let head = rightWords.prefix(length).map { $0.lowercased() }
            guard tail == head else { continue }

            let suffix = rightWords.dropFirst(length).joined(separator: " ")
            return suffix.isEmpty ? left : "\(left) \(suffix)"
        }

        return "\(left) \(right)"
    }
}

private struct AudioRecording {
    let bytes: Data
    let asset: AVURLAsset

    init(url: URL) throws {
        guard let bytes = try? Data(contentsOf: url), !bytes.isEmpty else {
            throw TranscribeError.noAudioData
        }

        let asset = AVURLAsset(url: url)
        self.bytes = bytes
        self.asset = asset
    }

    func measuredDuration() async -> TimeInterval {
        guard let time = try? await asset.load(.duration) else { return .nan }
        return CMTimeGetSeconds(time)
    }
}

private struct AudioSegmentExporter {
    let asset: AVAsset

    func export(_ window: AudioSegmentWindow) async throws -> Data {
        guard let exporter = AVAssetExportSession(
            asset: asset,
            presetName: AVAssetExportPresetAppleM4A
        ) else {
            throw TranscribeError.exportFailed("Could not create export session")
        }

        let destination = FileManager.default.temporaryDirectory.appendingPathComponent(
            "looper_seg_\(UUID().uuidString).m4a"
        )
        try? FileManager.default.removeItem(at: destination)
        defer { try? FileManager.default.removeItem(at: destination) }

        exporter.timeRange = CMTimeRange(
            start: CMTime(seconds: window.start, preferredTimescale: 44_100),
            end: CMTime(seconds: window.end, preferredTimescale: 44_100)
        )

        do {
            if #available(macOS 15.0, iOS 18.0, *) {
                try await exporter.export(to: destination, as: .m4a)
            } else {
                try await finishLegacy(exporter, at: destination)
            }
        } catch let error as TranscribeError {
            throw error
        } catch {
            throw TranscribeError.exportFailed(error.localizedDescription)
        }
        return try Data(contentsOf: destination)
    }

    @available(macOS, introduced: 10.7, obsoleted: 15.0)
    @available(iOS, introduced: 4.0, obsoleted: 18.0)
    private func finishLegacy(
        _ exporter: AVAssetExportSession,
        at destination: URL
    ) async throws {
        let reference = ExportSessionReference(exporter)
        exporter.outputURL = destination
        exporter.outputFileType = .m4a
        try await withCheckedThrowingContinuation {
            (continuation: CheckedContinuation<Void, Error>) in
            reference.value.exportAsynchronously {
                guard reference.value.status == .completed else {
                    let explanation = reference.value.error?.localizedDescription
                        ?? "Unknown export error"
                    continuation.resume(
                        throwing: TranscribeError.exportFailed(explanation)
                    )
                    return
                }
                continuation.resume(returning: ())
            }
        }
    }
}

private final class ExportSessionReference: @unchecked Sendable {
    let value: AVAssetExportSession

    init(_ value: AVAssetExportSession) {
        self.value = value
    }
}

struct SegmentBatchRunner {
    let capacity: Int

    func process(
        _ payloads: [Data],
        operation: @escaping (Data) async throws -> String
    ) async throws -> [String] {
        var completed = [String]()

        for offset in stride(from: 0, to: payloads.count, by: capacity) {
            let upperBound = min(offset + capacity, payloads.count)
            let batch = Array(payloads[offset..<upperBound])
            completed.append(contentsOf: try await processBatch(batch, operation: operation))
        }

        return completed
    }

    private func processBatch(
        _ payloads: [Data],
        operation: @escaping (Data) async throws -> String
    ) async throws -> [String] {
        try await withThrowingTaskGroup(of: (Int, String).self) { tasks in
            for (position, payload) in payloads.enumerated() {
                tasks.addTask {
                    (position, try await operation(payload))
                }
            }

            var unordered = [(Int, String)]()
            for try await result in tasks {
                unordered.append(result)
            }
            return unordered.sorted { $0.0 < $1.0 }.map(\.1)
        }
    }
}

class BaseTranscribeAudioRepo {
    func segmentDurationSec() -> TimeInterval { 60 }
    func overlapDurationSec() -> TimeInterval { 5 }
    func batchChunkCount() -> Int { 3 }

    func transcribeSegment(
        audioData: Data,
        prompt: String?,
        language: String?
    ) async throws -> String {
        fatalError("Subclasses must override transcribeSegment")
    }

    func transcribe(
        audioFileURL: URL,
        prompt: String? = nil,
        language: String? = nil
    ) async throws -> String {
        let recording = try AudioRecording(url: audioFileURL)
        let plan = AudioSegmentationPlan(
            segmentLength: segmentDurationSec(),
            overlap: overlapDurationSec()
        )
        let duration = await recording.measuredDuration()

        if plan.shouldUseOriginalFile(duration: duration) {
            return try await recognize(recording.bytes, prompt: prompt, language: language)
        }

        let exporter = AudioSegmentExporter(asset: recording.asset)
        var payloads = [Data]()
        for window in plan.windows(for: duration) {
            payloads.append(try await exporter.export(window))
        }

        let runner = SegmentBatchRunner(capacity: batchChunkCount())
        let fragments = try await runner.process(payloads) { payload in
            try await self.recognize(payload, prompt: prompt, language: language)
        }
        return TranscriptStitcher(wordSearchLimit: 20).combine(fragments)
    }

    private func recognize(
        _ payload: Data,
        prompt: String?,
        language: String?
    ) async throws -> String {
        let response = try await withRetry {
            try await self.transcribeSegment(
                audioData: payload,
                prompt: prompt,
                language: language
            )
        }
        return TranscriptPayload.text(from: response)
    }
}

enum TranscriptPayload {
    /// Algunos proveedores envuelven la transcripción en un objeto JSON aunque
    /// el contrato pida texto plano. Nunca insertamos ese protocolo en la app
    /// de destino: solo extraemos una propiedad inequívoca.
    static func text(from response: String) -> String {
        let trimmed = response.trimmingCharacters(in: .whitespacesAndNewlines)
        let jsonSource: String
        if trimmed.hasPrefix("```"), trimmed.hasSuffix("```") {
            guard let firstLine = trimmed.firstIndex(of: "\n") else { return response }
            jsonSource = String(trimmed[trimmed.index(after: firstLine)..<trimmed.index(trimmed.endIndex, offsetBy: -3)])
                .trimmingCharacters(in: .whitespacesAndNewlines)
        } else {
            jsonSource = trimmed
        }

        guard
            let data = jsonSource.data(using: .utf8),
            let object = try? JSONSerialization.jsonObject(with: data) as? [String: Any]
        else {
            return response
        }

        for key in ["text", "transcript"] {
            if let text = object[key] as? String, !text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
                return text
            }
        }
        return response
    }
}

struct CloudTranscriptionTransport {
    let rawValue: (
        RepoConfig,
        ConvexFunctionKind,
        String,
        [String: Any]
    ) async throws -> Any
    let upload: (String, Data, String) async throws -> String
    let objectValue: (
        RepoConfig,
        ConvexFunctionKind,
        String,
        [String: Any]
    ) async throws -> [String: Any]

    static let live = CloudTranscriptionTransport(
        rawValue: { config, kind, name, arguments in
            try await invokeHandlerRawValue(
                config: config,
                kind: kind,
                name: name,
                args: arguments
            )
        },
        upload: { destination, payload, mediaType in
            try await uploadFile(
                to: destination,
                data: payload,
                contentType: mediaType
            )
        },
        objectValue: { config, kind, name, arguments in
            try await invokeHandler(
                config: config,
                kind: kind,
                name: name,
                args: arguments
            )
        }
    )
}

class CloudTranscribeAudioRepo: BaseTranscribeAudioRepo {
    private let config: RepoConfig
    private let transport: CloudTranscriptionTransport

    init(config: RepoConfig) {
        self.config = config
        self.transport = .live
    }

    init(config: RepoConfig, transport: CloudTranscriptionTransport) {
        self.config = config
        self.transport = transport
    }

    override func transcribeSegment(
        audioData: Data,
        prompt _: String?,
        language: String?
    ) async throws -> String {
        let destinationValue = try await transport.rawValue(
            config,
            .mutation,
            "upload:generateUploadUrl",
            [:]
        )
        guard let destination = destinationValue as? String else {
            throw ApiError.parseError
        }

        let storageIdentifier = try await transport.upload(
            destination,
            audioData,
            AudioMediaType.detect(in: audioData)
        )
        let response = try await transport.objectValue(
            config,
            .action,
            "stt/transcribe:transcribe",
            Self.arguments(storageIdentifier: storageIdentifier, language: language)
        )
        guard let text = response["text"] as? String else {
            throw ApiError.parseError
        }
        return text
    }

    private static func arguments(
        storageIdentifier: String,
        language: String?
    ) -> [String: Any] {
        var arguments: [String: Any] = [
            "audioStorageId": storageIdentifier,
            "provider": "assemblyai",
            "model": "universal-3-5-pro",
        ]
        language.map { arguments["language"] = $0 }
        return arguments
    }
}

enum AudioMediaType {
    static func detect(in payload: Data) -> String {
        let prefix = String(data: payload.prefix(4), encoding: .ascii)
        let subtype = String(data: payload.dropFirst(8).prefix(4), encoding: .ascii)
        return prefix == "RIFF" && subtype == "WAVE" ? "audio/wav" : "audio/mp4"
    }
}

enum TranscribeError: Error, LocalizedError {
    case noAudioData
    case exportFailed(String)

    var errorDescription: String? {
        switch self {
        case .noAudioData:
            return "No audio data found"
        case let .exportFailed(explanation):
            return "Audio export failed: \(explanation)"
        }
    }
}
