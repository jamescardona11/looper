import Foundation

private enum ContractFailure: Error, CustomStringConvertible {
    case mismatch(String)

    var description: String {
        switch self {
        case let .mismatch(message):
            return message
        }
    }
}

private func expect<T: Equatable>(_ actual: T, _ expected: T, _ label: String) throws {
    guard actual == expected else {
        throw ContractFailure.mismatch("\(label): expected \(expected), received \(actual)")
    }
}

private func withTemporaryDefaults(
    _ body: (UserDefaults) throws -> Void
) throws {
    let suiteName = "com.j11.looper.tests.shared-keyboard.\(UUID().uuidString)"
    guard let defaults = UserDefaults(suiteName: suiteName) else {
        throw ContractFailure.mismatch("Unable to create isolated UserDefaults")
    }
    defer { defaults.removePersistentDomain(forName: suiteName) }
    try body(defaults)
}

private func testDictationWireContract() throws {
    try expect(DictationPhase.idle.rawValue, "idle", "idle phase")
    try expect(DictationPhase.active.rawValue, "active", "active phase")
    try expect(DictationPhase.recording.rawValue, "recording", "recording phase")

    let notifications = [
        DictationConstants.startRecording,
        DictationConstants.stopRecording,
        DictationConstants.stopDictation,
        DictationConstants.dictationPhaseChanged,
        DictationConstants.quickDictationRequested,
    ]
    try expect(
        notifications,
        [
            "com.j11.looper.startRecording",
            "com.j11.looper.stopRecording",
            "com.j11.looper.stopDictation",
            "com.j11.looper.dictationPhaseChanged",
            "com.j11.looper.quickDictationRequested",
        ],
        "Darwin notification names"
    )

    let keys = [
        DictationConstants.phaseKey,
        DictationConstants.startedAtKey,
        DictationConstants.audioLevelKey,
        DictationConstants.heartbeatKey,
        DictationConstants.keyboardFixtureReadyKey,
        DictationConstants.idleTimeoutKey,
    ]
    try expect(
        keys,
        [
            "looper_dictation_phase",
            "looper_dictation_started_at",
            "looper_audio_level",
            "looper_dictation_heartbeat",
            "looper_debug_keyboard_fixture_ready",
            "looper_idle_timeout_seconds",
        ],
        "shared defaults keys"
    )
    try expect(DictationConstants.heartbeatStaleThreshold, 5, "heartbeat threshold")
    try expect(DictationConstants.maxRecordingDuration, 240, "recording duration")
    try expect(DictationConstants.defaultIdleTimeout, 120, "idle timeout")
    try expect(DictationConstants.appGroupId, "group.com.j11.looper.mobile", "app group")
}

private func testToneLoadingContract() throws {
    try withTemporaryDefaults { defaults in
        let empty = SharedTone.loadFromDefaults(defaults)
        try expect(empty.selectedToneId, nil, "missing selected tone")
        try expect(empty.activeToneIds, nil, "missing active tones")
        try expect(empty.toneById?.count, nil, "missing tone catalog")

        defaults.set("concise", forKey: "looper_selected_tone_id")
        defaults.set(["concise", "warm"], forKey: "looper_active_tone_ids")
        let payload: [String: [String: String]] = [
            "concise": ["name": "Concise", "promptTemplate": "Use short sentences"],
            "partial": ["name": "Missing instructions"],
        ]
        defaults.set(try JSONSerialization.data(withJSONObject: payload), forKey: "looper_tone_by_id")

        let loaded = SharedTone.loadFromDefaults(defaults)
        try expect(loaded.selectedToneId, "concise", "selected tone")
        try expect(loaded.activeToneIds, ["concise", "warm"], "active tones")
        try expect(loaded.toneById?.count, 1, "valid tone count")
        try expect(loaded.toneById?["concise"]?.name, "Concise", "tone name")
        try expect(
            loaded.toneById?["concise"]?.promptTemplate,
            "Use short sentences",
            "tone instructions"
        )

        let invalidPayload: [String: [String: Any]] = [
            "concise": ["name": "Concise", "promptTemplate": "Use short sentences"],
            "invalid": ["name": 42, "promptTemplate": "Ignored"],
        ]
        defaults.set(
            try JSONSerialization.data(withJSONObject: invalidPayload),
            forKey: "looper_tone_by_id"
        )
        try expect(
            SharedTone.loadFromDefaults(defaults).toneById?.count,
            nil,
            "non-string tone catalog"
        )

        defaults.set(Data("not-json".utf8), forKey: "looper_tone_by_id")
        try expect(SharedTone.loadFromDefaults(defaults).toneById?.count, nil, "invalid tone catalog")
    }
}

private func testTermLoadingContract() throws {
    try withTemporaryDefaults { defaults in
        let empty = SharedTerm.loadFromDefaults(defaults)
        try expect(empty.termIds, [], "missing term order")
        try expect(empty.termById.count, 0, "missing term catalog")

        defaults.set(["replacement", "vocabulary"], forKey: "looper_term_ids")
        let payload: [String: [String: Any]] = [
            "replacement": [
                "sourceValue": "ACME",
                "destinationValue": "Acme",
                "isReplacement": true,
            ],
            "vocabulary": ["sourceValue": "Looper"],
            "invalid": ["sourceValue": 7, "destinationValue": "ignored"],
        ]
        defaults.set(try JSONSerialization.data(withJSONObject: payload), forKey: "looper_term_by_id")

        let loaded = SharedTerm.loadFromDefaults(defaults)
        try expect(loaded.termIds, ["replacement", "vocabulary"], "term order")
        try expect(loaded.termById.count, 2, "valid term count")
        try expect(loaded.termById["replacement"]?.sourceValue, "ACME", "replacement source")
        try expect(loaded.termById["replacement"]?.destinationValue, "Acme", "replacement target")
        try expect(loaded.termById["replacement"]?.isReplacement, true, "replacement flag")
        try expect(loaded.termById["vocabulary"]?.destinationValue, "", "default target")
        try expect(loaded.termById["vocabulary"]?.isReplacement, false, "default flag")

        defaults.set(Data("not-json".utf8), forKey: "looper_term_by_id")
        try expect(SharedTerm.loadFromDefaults(defaults).termById.count, 0, "invalid term catalog")
    }
}

private func testDarwinNotificationLifecycle() throws {
    let manager = DarwinNotificationManager.shared
    let name = "com.j11.looper.tests.\(UUID().uuidString)"
    var deliveryCount = 0

    manager.observe(name) { deliveryCount += 1 }
    manager.post(name)
    RunLoop.main.run(until: Date().addingTimeInterval(0.05))
    try expect(deliveryCount, 1, "registered Darwin callback")

    manager.removeObserver(name)
    manager.post(name)
    RunLoop.main.run(until: Date().addingTimeInterval(0.05))
    try expect(deliveryCount, 1, "removed Darwin callback")

    let secondName = "\(name).second"
    manager.observe(name) { deliveryCount += 10 }
    manager.observe(secondName) { deliveryCount += 100 }
    manager.removeAll()
    manager.post(name)
    manager.post(secondName)
    RunLoop.main.run(until: Date().addingTimeInterval(0.05))
    try expect(deliveryCount, 1, "removed all Darwin callbacks")
}

@main
private enum SharedKeyboardContractsTestRunner {
    static func main() {
        do {
            try testDictationWireContract()
            try testToneLoadingContract()
            try testTermLoadingContract()
            try testDarwinNotificationLifecycle()
            print("PASS: 4 shared keyboard contract groups")
        } catch {
            fputs("FAIL: \(error)\n", stderr)
            exit(1)
        }
    }
}
