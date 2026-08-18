import UIKit

enum DestinationInsertion {
    static func prepare(
        _ text: String,
        contextBefore: String?,
        keyboardType: UIKeyboardType,
        autocapitalization: UITextAutocapitalizationType,
        secure: Bool
    ) -> String {
        var body = text.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !body.isEmpty else { return "" }

        let literal = secure || keyboardType == .emailAddress || keyboardType == .URL
        let search = keyboardType == .webSearch
        if search, body.last == "." {
            body.removeLast()
        }

        if !literal && !search {
            let sentenceBoundary = contextBefore
                .map { value in
                    let trimmed = value.trimmingCharacters(in: .whitespaces)
                    guard let last = trimmed.last else { return true }
                    return ".!?\n".contains(last)
                } ?? true
            switch autocapitalization {
            case .allCharacters:
                body = body.uppercased()
            case .words:
                body = uppercaseFirstLetter(body)
            case .sentences where sentenceBoundary:
                body = uppercaseFirstLetter(body)
            default:
                break
            }
        }

        let prefix: String
        if literal {
            prefix = ""
        } else if let last = contextBefore?.last,
                  !last.isWhitespace,
                  !"([{/@#\"'\n".contains(last) {
            prefix = " "
        } else {
            prefix = ""
        }
        return prefix + body + (literal ? "" : " ")
    }

    private static func uppercaseFirstLetter(_ value: String) -> String {
        guard let index = value.firstIndex(where: { $0.isLetter }) else { return value }
        return String(value[..<index])
            + value[index].uppercased()
            + String(value[value.index(after: index)...])
    }
}
