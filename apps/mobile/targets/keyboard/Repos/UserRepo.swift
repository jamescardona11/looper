import Foundation

// El teclado consulta la fila del usuario autenticado mediante `users:me`.
struct UserInfo {
    let id: String
    let name: String
    let email: String?
    let createdAt: String
}

class UserRepo {
    private let config: RepoConfig

    init(config: RepoConfig) {
        self.config = config
    }

    // No mutation in backend/convex/ persists word counters server-side (see
    // header comment) — documented no-op instead of calling the nonexistent
    // nonexistent word-count mutation.
    // TODO: sin equivalente real en el backend Convex.
    func incrementWordCount(text: String, timezone: String? = nil) {
    }
}
