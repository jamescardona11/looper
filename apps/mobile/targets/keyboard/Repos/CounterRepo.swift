import Foundation

class CounterRepo {
    private enum Channel {
        case app
        case keyboard

        var storageKey: String {
            switch self {
            case .app:
                return "looper_app_update_counter"
            case .keyboard:
                return "looper_keyboard_update_counter"
            }
        }
    }

    private let defaults: UserDefaults?

    init() {
        defaults = UserDefaults(suiteName: DictationConstants.appGroupId)
    }

    init(defaults: UserDefaults?) {
        self.defaults = defaults
    }

    func incrementApp() {
        increment(.app)
    }

    func getApp() -> Int {
        value(for: .app)
    }

    func incrementKeyboard() {
        increment(.keyboard)
    }

    func getKeyboard() -> Int {
        value(for: .keyboard)
    }

    private func increment(_ channel: Channel) {
        guard let defaults else { return }
        let next = defaults.integer(forKey: channel.storageKey) + 1
        defaults.set(next, forKey: channel.storageKey)
    }

    private func value(for channel: Channel) -> Int {
        defaults?.integer(forKey: channel.storageKey) ?? 0
    }
}
