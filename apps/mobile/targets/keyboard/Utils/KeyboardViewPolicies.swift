import Foundation

enum KeyboardLanguagePolicy {
  static func shortCode(for language: String) -> String {
    let base = language.firstIndex(of: "-").map { language[..<$0] } ?? language[...]
    return String(base).uppercased()
  }

  static func next(after current: String, among languages: [String]) -> String? {
    guard !languages.isEmpty else { return nil }
    let currentPosition = languages.firstIndex(of: current) ?? 0
    return languages[(currentPosition + 1) % languages.count]
  }
}

enum KeyboardMemberBanner: Equatable {
  case hidden
  case trial(String)
  case free

  static func resolve(
    member: MemberInfo?,
    transcriptionMode: String,
    postProcessingMode: String,
    now: Date
  ) -> KeyboardMemberBanner {
    if transcriptionMode == "api" && postProcessingMode == "api" { return .hidden }
    guard let member else { return .hidden }
    guard member.isOnTrial else { return member.plan == "free" ? .free : .hidden }
    guard let end = member.trialEndsAt.flatMap(parseFractionalTimestamp) else {
      return .trial("Your trial ends soon")
    }

    let remaining = max(0, Int(ceil(end.timeIntervalSince(now) / 86_400)))
    switch remaining {
    case 0: return .trial("Last day of trial")
    case 1: return .trial("1 day left in trial")
    default: return .trial("\(remaining) days left in trial")
    }
  }

  private static func parseFractionalTimestamp(_ value: String) -> Date? {
    let formatter = ISO8601DateFormatter()
    formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
    return formatter.date(from: value)
  }
}

struct KeyboardSessionTokens: Equatable {
  let idToken: String
  let refreshToken: String
}

enum KeyboardSessionWire {
  static func makeRefreshRequest(baseURL: String, refreshToken: String) -> URLRequest? {
    guard let endpoint = URL(string: baseURL + "/api/action") else { return nil }
    var request = URLRequest(url: endpoint)
    request.httpMethod = "POST"
    request.setValue("application/json", forHTTPHeaderField: "Content-Type")
    request.httpBody = try? JSONSerialization.data(withJSONObject: [
      "path": "auth:signIn",
      "format": "convex_encoded_json",
      "args": [["refreshToken": refreshToken]],
    ])
    return request
  }

  static func decodeTokens(from data: Data) -> KeyboardSessionTokens? {
    guard
      let envelope = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
      envelope["status"] as? String == "success",
      let value = envelope["value"] as? [String: Any],
      let tokens = value["tokens"] as? [String: Any],
      let idToken = tokens["token"] as? String,
      let refreshToken = tokens["refreshToken"] as? String
    else {
      return nil
    }
    return KeyboardSessionTokens(idToken: idToken, refreshToken: refreshToken)
  }

  static func errorMessage(in data: Data) -> String? {
    let envelope = try? JSONSerialization.jsonObject(with: data) as? [String: Any]
    return envelope?["errorMessage"] as? String
  }

  static func expiry(of jwt: String) -> Date? {
    let pieces = jwt.split(separator: ".")
    guard pieces.count >= 2 else { return nil }
    var encodedPayload = String(pieces[1])
      .replacingOccurrences(of: "-", with: "+")
      .replacingOccurrences(of: "_", with: "/")
    encodedPayload += String(repeating: "=", count: (4 - encodedPayload.count % 4) % 4)

    guard
      let bytes = Data(base64Encoded: encodedPayload),
      let payload = try? JSONSerialization.jsonObject(with: bytes) as? [String: Any],
      let seconds = payload["exp"] as? TimeInterval
    else {
      return nil
    }
    return Date(timeIntervalSince1970: seconds)
  }
}
