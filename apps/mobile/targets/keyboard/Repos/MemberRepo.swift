import Foundation

struct MemberInfo {
  let plan: String
  let isOnTrial: Bool
  let trialEndsAt: String?
}

private struct SubscriptionSnapshot {
  let tier: String
  let status: String
  let expirationMilliseconds: Double?

  init(fields: [String: Any]) {
    tier = fields["tier"] as? String ?? "free"
    status = fields["status"] as? String ?? "none"
    expirationMilliseconds = fields["expiresAt"] as? Double
  }

  func member(using formatter: ISO8601DateFormatter) -> MemberInfo {
    let trialActive = status == "trialing"
    let trialEnd =
      trialActive
      ? expirationMilliseconds.map {
        formatter.string(from: Date(timeIntervalSince1970: $0 / 1_000))
      }
      : nil
    return MemberInfo(plan: tier, isOnTrial: trialActive, trialEndsAt: trialEnd)
  }
}

typealias MemberQuery = (RepoConfig) async throws -> [String: Any]

final class MemberRepo {
  private let config: RepoConfig
  private let query: MemberQuery

  init(config: RepoConfig) {
    self.config = config
    query = { configuration in
      try await invokeHandler(
        config: configuration,
        kind: .query,
        name: "payments/subscription:mySubscription",
        args: [:]
      )
    }
  }

  init(config: RepoConfig, query: @escaping MemberQuery) {
    self.config = config
    self.query = query
  }

  func getMyMember() async throws -> MemberInfo? {
    let fields = try await query(config)
    return SubscriptionSnapshot(fields: fields).member(using: ISO8601DateFormatter())
  }
}
