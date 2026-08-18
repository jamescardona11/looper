import Foundation

struct SharedWorkflow {
    let id: String
    let name: String
    let enabled: Bool
    let triggerType: String
    let input: String
    let engine: String
    let language: String?
    let transformPreset: String?
    let customPrompt: String?
    let deterministicOnly: Bool
    let output: String
    let autoSendOnInsert: Bool

    static func loadFromDefaults(_ defaults: UserDefaults) -> [SharedWorkflow] {
        guard let data = defaults.data(forKey: "looper_smart_mode_rules"),
              let rows = try? JSONSerialization.jsonObject(with: data) as? [[String: Any]] else {
            return []
        }

        return rows.compactMap { row in
            guard let id = row["id"] as? String, !id.isEmpty else { return nil }
            return SharedWorkflow(
                id: id,
                name: (row["name"] as? String)?.trimmingCharacters(in: .whitespacesAndNewlines).nonEmpty ?? "Workflow",
                enabled: row["enabled"] as? Bool ?? true,
                triggerType: row["triggerType"] as? String ?? "manual",
                input: row["input"] as? String ?? "dictation",
                engine: row["engine"] as? String ?? "auto",
                language: (row["language"] as? String)?.nonEmpty,
                transformPreset: (row["transformPreset"] as? String)?.nonEmpty,
                customPrompt: (row["customPrompt"] as? String)?.nonEmpty,
                deterministicOnly: row["deterministicOnly"] as? Bool ?? false,
                output: ["insert", "replace", "copy"].contains(row["output"] as? String ?? "")
                    ? row["output"] as? String ?? "insert"
                    : "copy",
                autoSendOnInsert: row["autoSendOnInsert"] as? Bool ?? false
            )
        }
    }
}

private extension String {
    var nonEmpty: String? { isEmpty ? nil : self }
}
