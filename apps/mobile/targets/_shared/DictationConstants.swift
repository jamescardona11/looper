import Foundation

enum DictationPhase: String {
    case idle
    case active
    case recording
}

private enum DictationWireFormat {
    static let notificationNamespace = "com.j11.looper"
    static let defaultsNamespace = "looper"
    static let audioFilename = "dictation_recording.m4a"

    static func notification(_ event: String) -> String {
        [notificationNamespace, event].joined(separator: ".")
    }

    static func defaultsKey(_ name: String) -> String {
        [defaultsNamespace, name].joined(separator: "_")
    }
}

struct DictationConstants {
    static let startRecording = DictationWireFormat.notification("startRecording")
    static let stopRecording = DictationWireFormat.notification("stopRecording")
    static let stopDictation = DictationWireFormat.notification("stopDictation")
    static let dictationPhaseChanged = DictationWireFormat.notification("dictationPhaseChanged")
    static let quickDictationRequested = DictationWireFormat.notification("quickDictationRequested")

    static let phaseKey = DictationWireFormat.defaultsKey("dictation_phase")
    static let startedAtKey = DictationWireFormat.defaultsKey("dictation_started_at")
    static let audioLevelKey = DictationWireFormat.defaultsKey("audio_level")
    static let heartbeatKey = DictationWireFormat.defaultsKey("dictation_heartbeat")
    static let keyboardFixtureReadyKey = DictationWireFormat.defaultsKey("debug_keyboard_fixture_ready")
    static let idleTimeoutKey = DictationWireFormat.defaultsKey("idle_timeout_seconds")

    static let heartbeatStaleThreshold: TimeInterval = 5
    static let maxRecordingDuration: TimeInterval = 4 * 60
    static let defaultIdleTimeout: TimeInterval = 2 * 60

    static let appGroupId = "group.com.j11.looper.mobile"

    static var audioFileURL: URL? {
        guard let container = FileManager.default.containerURL(
            forSecurityApplicationGroupIdentifier: appGroupId
        ) else {
            return nil
        }

        return container.appendingPathComponent(DictationWireFormat.audioFilename)
    }
}
