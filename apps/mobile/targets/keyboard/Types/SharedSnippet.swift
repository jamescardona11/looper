import Foundation

struct SharedSnippet {
    let trigger: String
    let expansion: String

    static func loadFromDefaults(_ defaults: UserDefaults) -> [SharedSnippet] {
        guard let data = defaults.data(forKey: "looper_snippets"),
              let rows = try? JSONSerialization.jsonObject(with: data) as? [[String: Any]] else {
            return []
        }

        return rows.prefix(64).compactMap { row in
            guard let trigger = (row["trigger"] as? String)?.trimmingCharacters(in: .whitespacesAndNewlines),
                  let expansion = (row["expansion"] as? String)?.trimmingCharacters(in: .whitespacesAndNewlines),
                  !trigger.isEmpty,
                  !expansion.isEmpty else {
                return nil
            }
            return SharedSnippet(
                trigger: String(trigger.prefix(100)),
                expansion: String(expansion.prefix(2_000))
            )
        }
    }
}
