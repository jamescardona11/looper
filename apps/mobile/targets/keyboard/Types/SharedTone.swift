import Foundation

struct SharedTone {
    let name: String
    let promptTemplate: String

    static func loadFromDefaults(
        _ defaults: UserDefaults
    ) -> (
        selectedToneId: String?,
        activeToneIds: [String]?,
        toneById: [String: SharedTone]?
    ) {
        let store = ToneDefaults(defaults)
        return (
            selectedToneId: store.selectedIdentifier,
            activeToneIds: store.activeIdentifiers,
            toneById: store.catalog
        )
    }
}

private struct ToneDefaults {
    private enum Key {
        static let selected = "looper_selected_tone_id"
        static let active = "looper_active_tone_ids"
        static let catalog = "looper_tone_by_id"
    }

    private let defaults: UserDefaults

    init(_ defaults: UserDefaults) {
        self.defaults = defaults
    }

    var selectedIdentifier: String? {
        defaults.string(forKey: Key.selected)
    }

    var activeIdentifiers: [String]? {
        defaults.stringArray(forKey: Key.active)
    }

    var catalog: [String: SharedTone]? {
        guard let payload = defaults.data(forKey: Key.catalog) else { return nil }
        guard let object = try? JSONSerialization.jsonObject(with: payload) else { return nil }
        guard let records = object as? [String: [String: String]] else { return nil }

        return records.reduce(into: [:]) { catalog, record in
            let fields = record.value
            guard let title = fields["name"], let instructions = fields["promptTemplate"] else {
                return
            }
            catalog[record.key] = SharedTone(name: title, promptTemplate: instructions)
        }
    }
}
