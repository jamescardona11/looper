import Foundation

struct SharedTerm {
    let sourceValue: String
    let destinationValue: String
    let isReplacement: Bool

    static func loadFromDefaults(
        _ defaults: UserDefaults
    ) -> (
        termIds: [String],
        termById: [String: SharedTerm]
    ) {
        let store = TermDefaults(defaults)
        return (termIds: store.orderedIdentifiers, termById: store.catalog)
    }
}

private struct TermDefaults {
    private enum Key {
        static let order = "looper_term_ids"
        static let catalog = "looper_term_by_id"
    }

    private let defaults: UserDefaults

    init(_ defaults: UserDefaults) {
        self.defaults = defaults
    }

    var orderedIdentifiers: [String] {
        defaults.stringArray(forKey: Key.order) ?? []
    }

    var catalog: [String: SharedTerm] {
        guard let payload = defaults.data(forKey: Key.catalog) else { return [:] }
        guard let object = try? JSONSerialization.jsonObject(with: payload) else { return [:] }
        guard let records = object as? [String: [String: Any]] else { return [:] }

        return records.reduce(into: [:]) { catalog, record in
            guard let source = record.value["sourceValue"] as? String else { return }

            catalog[record.key] = SharedTerm(
                sourceValue: source,
                destinationValue: record.value["destinationValue"] as? String ?? "",
                isReplacement: record.value["isReplacement"] as? Bool ?? false
            )
        }
    }
}
