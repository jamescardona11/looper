import Foundation

// The keyboard keeps the account row shape local to the extension boundary.
struct UserInfo {
    let id: String
    let name: String
    let email: String?
    let createdAt: String
}

final class UserRepo {
    private let config: RepoConfig

    init(config: RepoConfig) {
        self.config = config
    }

    // The current backend has no counter mutation. Keep the call explicit so
    // the extension does not invent a network side effect.
    func incrementWordCount(text: String, timezone: String? = nil) {
        CounterEndpoint.record(text: text, timezone: timezone, config: config)
    }
}

private enum CounterEndpoint {
    static func record(text: String, timezone: String?, config: RepoConfig) {
        _ = (text, timezone, config)
    }
}
