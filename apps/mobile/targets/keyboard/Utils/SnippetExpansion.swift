import Foundation

enum SnippetExpansion {
    private static let maximumDynamicValueLength = 20_000

    static func requiresClipboard(_ snippets: [SharedSnippet], in text: String) -> Bool {
        snippets.contains { snippet in
            guard let trigger = try? NSRegularExpression(
                pattern: "(?i)\\b\(NSRegularExpression.escapedPattern(for: snippet.trigger))\\b"
            ), let expression = try? NSRegularExpression(
                pattern: #"\{\{\s*CLIPBOARD\s*\}\}"#,
                options: [.caseInsensitive]
            ) else {
                return false
            }
            let textRange = NSRange(text.startIndex..<text.endIndex, in: text)
            let expansionRange = NSRange(
                snippet.expansion.startIndex..<snippet.expansion.endIndex,
                in: snippet.expansion
            )
            return trigger.firstMatch(in: text, range: textRange) != nil
                && expression.firstMatch(in: snippet.expansion, range: expansionRange) != nil
        }
    }

    static func apply(
        _ text: String,
        snippets: [SharedSnippet],
        now: Date = Date(),
        clipboard: String?,
        app: String?,
        selection: String?
    ) -> String {
        var result = text
        for snippet in snippets {
            guard let expression = try? NSRegularExpression(
                pattern: "(?i)\\b\(NSRegularExpression.escapedPattern(for: snippet.trigger))\\b"
            ) else {
                continue
            }
            let expansion = expandVariables(
                snippet.expansion,
                now: now,
                clipboard: clipboard,
                app: app,
                selection: selection
            )
            let range = NSRange(result.startIndex..<result.endIndex, in: result)
            for match in expression.matches(in: result, range: range).reversed() {
                guard let swiftRange = Range(match.range, in: result) else { continue }
                result.replaceSubrange(swiftRange, with: expansion)
            }
        }
        return result
    }

    private static func expandVariables(
        _ template: String,
        now: Date,
        clipboard: String?,
        app: String?,
        selection: String?
    ) -> String {
        guard let expression = try? NSRegularExpression(
            pattern: #"\{\{\s*(DATE|TIME|CLIPBOARD|APP|SELECTION)\s*\}\}"#,
            options: [.caseInsensitive]
        ) else {
            return template
        }

        let date = DateFormatter()
        date.dateStyle = .medium
        date.timeStyle = .none
        let time = DateFormatter()
        time.dateStyle = .none
        time.timeStyle = .short
        let values: [String: String?] = [
            "DATE": date.string(from: now),
            "TIME": time.string(from: now),
            "CLIPBOARD": bounded(clipboard),
            "APP": bounded(app),
            "SELECTION": bounded(selection),
        ]

        var result = template
        let range = NSRange(result.startIndex..<result.endIndex, in: result)
        for match in expression.matches(in: result, range: range).reversed() {
            guard match.numberOfRanges == 2,
                  let nameRange = Range(match.range(at: 1), in: result),
                  let fullRange = Range(match.range, in: result) else {
                continue
            }
            let name = String(result[nameRange]).uppercased()
            guard let value = values[name] ?? nil else { continue }
            result.replaceSubrange(fullRange, with: value)
        }
        return result
    }

    private static func bounded(_ value: String?) -> String? {
        guard let value = value?.trimmingCharacters(in: .whitespacesAndNewlines),
              !value.isEmpty else {
            return nil
        }
        return String(value.prefix(maximumDynamicValueLength))
    }
}
