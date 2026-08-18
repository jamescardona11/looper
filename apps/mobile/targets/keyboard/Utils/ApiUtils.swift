import Foundation

enum ConvexFunctionKind: String {
  case query
  case mutation
  case action
}

enum ApiError: Error, LocalizedError {
  case invalidURL
  case httpError(Int, String)
  case convexError(String)
  case parseError

  var errorDescription: String? {
    switch self {
    case .invalidURL:
      return "Invalid function URL"
    case .httpError(let status, let responseBody):
      return "HTTP \(status): \(responseBody.prefix(200))"
    case .convexError(let explanation):
      return explanation
    case .parseError:
      return "Could not parse response"
    }
  }
}

typealias ApiTransport = (URLRequest) async throws -> (Data, URLResponse)

private struct ConvexInvocation {
  let config: RepoConfig
  let kind: ConvexFunctionKind
  let path: String
  let arguments: [String: Any]

  func request() throws -> URLRequest {
    guard let endpoint = URL(string: config.functionUrl + "/api/" + kind.rawValue) else {
      throw ApiError.invalidURL
    }
    var request = URLRequest(url: endpoint)
    request.httpMethod = "POST"
    request.httpBody = try JSONSerialization.data(withJSONObject: [
      "path": path,
      "format": "convex_encoded_json",
      "args": [arguments],
    ])
    request.setValue("Bearer " + config.idToken, forHTTPHeaderField: "Authorization")
    request.setValue("application/json", forHTTPHeaderField: "Content-Type")
    return request
  }
}

private enum ApiResponse {
  static func successfulData(_ data: Data, _ response: URLResponse) throws -> Data {
    let status = (response as? HTTPURLResponse)?.statusCode ?? -1
    guard (200...299).contains(status) else {
      throw ApiError.httpError(status, String(decoding: data, as: UTF8.self))
    }
    return data
  }

  static func convexValue(from data: Data, functionName: String) throws -> Any? {
    guard let envelope = try JSONSerialization.jsonObject(with: data) as? [String: Any] else {
      throw ApiError.parseError
    }
    guard envelope["status"] as? String == "success" else {
      let fallback = functionName + " failed"
      throw ApiError.convexError(envelope["errorMessage"] as? String ?? fallback)
    }
    return envelope["value"]
  }

  static func storageIdentifier(from data: Data) throws -> String {
    let decoded = try JSONSerialization.jsonObject(with: data)
    guard
      let fields = decoded as? [String: Any],
      let storageIdentifier = fields["storageId"] as? String
    else {
      throw ApiError.parseError
    }
    return storageIdentifier
  }
}

private let liveApiTransport: ApiTransport = { request in
  try await URLSession.shared.data(for: request)
}

func invokeConvexValue(
  config: RepoConfig,
  kind: ConvexFunctionKind,
  name: String,
  args: [String: Any],
  transport: @escaping ApiTransport
) async throws -> Any? {
  let operation = ConvexInvocation(config: config, kind: kind, path: name, arguments: args)
  let (data, response) = try await transport(operation.request())
  return try ApiResponse.convexValue(
    from: ApiResponse.successfulData(data, response),
    functionName: name
  )
}

func invokeHandler(
  config: RepoConfig,
  kind: ConvexFunctionKind,
  name: String,
  args: [String: Any]
) async throws -> [String: Any] {
  try await invokeHandler(
    config: config,
    kind: kind,
    name: name,
    args: args,
    transport: liveApiTransport
  )
}

func invokeHandler(
  config: RepoConfig,
  kind: ConvexFunctionKind,
  name: String,
  args: [String: Any],
  transport: @escaping ApiTransport
) async throws -> [String: Any] {
  let value = try await invokeConvexValue(
    config: config,
    kind: kind,
    name: name,
    args: args,
    transport: transport
  )
  guard let object = value as? [String: Any] else { throw ApiError.parseError }
  return object
}

func invokeHandlerRawValue(
  config: RepoConfig,
  kind: ConvexFunctionKind,
  name: String,
  args: [String: Any]
) async throws -> Any {
  guard
    let value = try await invokeConvexValue(
      config: config,
      kind: kind,
      name: name,
      args: args,
      transport: liveApiTransport
    )
  else {
    throw ApiError.parseError
  }
  return value
}

func uploadFile(to urlString: String, data: Data, contentType: String) async throws -> String {
  try await uploadFile(
    to: urlString,
    data: data,
    contentType: contentType,
    transport: liveApiTransport
  )
}

func uploadFile(
  to urlString: String,
  data: Data,
  contentType: String,
  transport: @escaping ApiTransport
) async throws -> String {
  guard let endpoint = URL(string: urlString) else { throw ApiError.invalidURL }
  var request = URLRequest(url: endpoint)
  request.httpMethod = "POST"
  request.httpBody = data
  request.setValue(contentType, forHTTPHeaderField: "Content-Type")

  let (responseData, response) = try await transport(request)
  let successfulData = try ApiResponse.successfulData(responseData, response)
  return try ApiResponse.storageIdentifier(from: successfulData)
}

func invokeHandlerFireAndForget(
  config: RepoConfig,
  kind: ConvexFunctionKind,
  name: String,
  args: [String: Any]
) {
  Task {
    do {
      _ = try await invokeHandler(config: config, kind: kind, name: name, args: args)
    } catch {
      NSLog("[LooperKB] %@ failed: %@", name, error.localizedDescription)
    }
  }
}
