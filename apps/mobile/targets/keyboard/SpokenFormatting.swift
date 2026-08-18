import Foundation

enum SpokenFormatting {
    private enum Action {
        case punctuation(Character)
        case newlines(String)
        case removeLastWord
        case removeClause
        case open(Character)
        case close(Character)
        case join(String)
        case bullet
        case numberedItem
        case nextItem
        case literalOn
        case literalOff
    }

    private struct Command {
        let languages: Set<String>
        let phrase: [String]
        let action: Action
    }

    private static let commands: [Command] = [
        Command(languages: ["en"], phrase: ["end", "literal", "mode"], action: .literalOff),
        Command(languages: ["es"], phrase: ["fin", "modo", "literal"], action: .literalOff),
        Command(languages: ["pt"], phrase: ["fim", "modo", "literal"], action: .literalOff),
        Command(languages: ["en"], phrase: ["literal", "mode"], action: .literalOn),
        Command(languages: ["es", "pt"], phrase: ["modo", "literal"], action: .literalOn),
        Command(languages: ["en"], phrase: ["numbered", "item"], action: .numberedItem),
        Command(languages: ["es"], phrase: ["elemento", "numerado"], action: .numberedItem),
        Command(languages: ["pt"], phrase: ["item", "numerado"], action: .numberedItem),
        Command(languages: ["en"], phrase: ["bullet", "point"], action: .bullet),
        Command(languages: ["es"], phrase: ["punto", "de", "lista"], action: .bullet),
        Command(languages: ["pt"], phrase: ["ponto", "de", "lista"], action: .bullet),
        Command(languages: ["en"], phrase: ["next", "item"], action: .nextItem),
        Command(languages: ["es"], phrase: ["siguiente", "elemento"], action: .nextItem),
        Command(languages: ["pt"], phrase: ["próximo", "item"], action: .nextItem),
        Command(languages: ["en"], phrase: ["open", "parenthesis"], action: .open("(")),
        Command(languages: ["es"], phrase: ["abre", "paréntesis"], action: .open("(")),
        Command(languages: ["pt"], phrase: ["abre", "parênteses"], action: .open("(")),
        Command(languages: ["en"], phrase: ["close", "parenthesis"], action: .close(")")),
        Command(languages: ["es"], phrase: ["cierra", "paréntesis"], action: .close(")")),
        Command(languages: ["pt"], phrase: ["fecha", "parênteses"], action: .close(")")),
        Command(languages: ["en"], phrase: ["open", "bracket"], action: .open("[")),
        Command(languages: ["es"], phrase: ["abre", "corchete"], action: .open("[")),
        Command(languages: ["pt"], phrase: ["abre", "colchete"], action: .open("[")),
        Command(languages: ["en"], phrase: ["close", "bracket"], action: .close("]")),
        Command(languages: ["es"], phrase: ["cierra", "corchete"], action: .close("]")),
        Command(languages: ["pt"], phrase: ["fecha", "colchete"], action: .close("]")),
        Command(languages: ["en"], phrase: ["at", "sign"], action: .join("@")),
        Command(languages: ["es", "pt"], phrase: ["arroba"], action: .join("@")),
        Command(languages: ["en"], phrase: ["dot"], action: .join(".")),
        Command(languages: ["es"], phrase: ["punto", "sin", "espacio"], action: .join(".")),
        Command(languages: ["pt"], phrase: ["ponto", "sem", "espaço"], action: .join(".")),
        Command(languages: ["en"], phrase: ["slash"], action: .join("/")),
        Command(languages: ["es", "pt"], phrase: ["barra"], action: .join("/")),
        Command(languages: ["es"], phrase: ["signo", "de", "interrogación"], action: .punctuation("?")),
        Command(languages: ["es"], phrase: ["signo", "de", "exclamación"], action: .punctuation("!")),
        Command(languages: ["pt"], phrase: ["ponto", "de", "interrogação"], action: .punctuation("?")),
        Command(languages: ["pt"], phrase: ["ponto", "de", "exclamação"], action: .punctuation("!")),
        Command(languages: ["en"], phrase: ["exclamation", "point"], action: .punctuation("!")),
        Command(languages: ["en"], phrase: ["exclamation", "mark"], action: .punctuation("!")),
        Command(languages: ["en"], phrase: ["question", "mark"], action: .punctuation("?")),
        Command(languages: ["en"], phrase: ["full", "stop"], action: .punctuation(".")),
        Command(languages: ["en"], phrase: ["new", "paragraph"], action: .newlines("\n\n")),
        Command(languages: ["es"], phrase: ["nuevo", "párrafo"], action: .newlines("\n\n")),
        Command(languages: ["pt"], phrase: ["novo", "parágrafo"], action: .newlines("\n\n")),
        Command(languages: ["en"], phrase: ["new", "line"], action: .newlines("\n")),
        Command(languages: ["es"], phrase: ["nueva", "línea"], action: .newlines("\n")),
        Command(languages: ["pt"], phrase: ["nova", "linha"], action: .newlines("\n")),
        Command(languages: ["es"], phrase: ["punto", "y", "coma"], action: .punctuation(";")),
        Command(languages: ["pt"], phrase: ["ponto", "e", "vírgula"], action: .punctuation(";")),
        Command(languages: ["es"], phrase: ["dos", "puntos"], action: .punctuation(":")),
        Command(languages: ["pt"], phrase: ["dois", "pontos"], action: .punctuation(":")),
        Command(languages: ["en"], phrase: ["no", "wait"], action: .removeLastWord),
        Command(languages: ["en"], phrase: ["i", "mean"], action: .removeLastWord),
        Command(languages: ["es"], phrase: ["mejor", "dicho"], action: .removeLastWord),
        Command(languages: ["es"], phrase: ["quise", "decir"], action: .removeLastWord),
        Command(languages: ["pt"], phrase: ["quer", "dizer"], action: .removeLastWord),
        Command(languages: ["pt"], phrase: ["melhor", "dizendo"], action: .removeLastWord),
        Command(languages: ["en"], phrase: ["scratch", "that"], action: .removeClause),
        Command(languages: ["es"], phrase: ["borra", "eso"], action: .removeClause),
        Command(languages: ["pt"], phrase: ["apaga", "isso"], action: .removeClause),
        Command(languages: ["en"], phrase: ["comma"], action: .punctuation(",")),
        Command(languages: ["en"], phrase: ["period"], action: .punctuation(".")),
        Command(languages: ["en"], phrase: ["colon"], action: .punctuation(":")),
        Command(languages: ["en"], phrase: ["semicolon"], action: .punctuation(";")),
        Command(languages: ["es"], phrase: ["coma"], action: .punctuation(",")),
        Command(languages: ["es"], phrase: ["punto"], action: .punctuation(".")),
        Command(languages: ["pt"], phrase: ["vírgula"], action: .punctuation(",")),
        Command(languages: ["pt"], phrase: ["ponto"], action: .punctuation("."))
    ]

    static func apply(_ transcript: String, language: String) -> String {
        let rawTokens = transcript.split(whereSeparator: { $0.isWhitespace }).map(String.init)
        guard !rawTokens.isEmpty else { return "" }
        let tokens = rawTokens.map(normalizeToken)
        let languageCode = normalizedLanguageCode(language)
        var output = ""
        var index = 0
        var literalMode = false
        var listIsNumbered = false
        var listNumber = 0
        var joinNext = false

        while index < rawTokens.count {
            let command = commands.first { candidate in
                guard languageCode == nil || candidate.languages.contains(languageCode!) else {
                    return false
                }
                let end = index + candidate.phrase.count
                guard end <= tokens.count else { return false }
                return Array(tokens[index..<end]) == candidate.phrase
            }

            if let command {
                if literalMode {
                    if case .literalOff = command.action {
                        literalMode = false
                        index += command.phrase.count
                        continue
                    }
                } else {
                    if case .literalOn = command.action {
                        literalMode = true
                        index += command.phrase.count
                        continue
                    }
                    apply(
                        command.action,
                        to: &output,
                        listIsNumbered: &listIsNumbered,
                        listNumber: &listNumber,
                        joinNext: &joinNext
                    )
                    index += command.phrase.count
                    continue
                }
            }

            if !literalMode, let languageCode,
               let entity = SpokenEntities.match(tokens, start: index, language: languageCode) {
                if !output.isEmpty && output.last?.isWhitespace == false && !joinNext {
                    output.append(" ")
                }
                output.append(entity.text)
                joinNext = false
                index += entity.consumed
                continue
            }

            if !output.isEmpty && output.last?.isWhitespace == false && !joinNext {
                output.append(" ")
            }
            output.append(rawTokens[index])
            joinNext = false
            index += 1
        }
        return output.trimmingCharacters(in: .whitespacesAndNewlines)
    }

    private static func normalizeToken(_ token: String) -> String {
        token.trimmingCharacters(in: CharacterSet.alphanumerics.inverted).lowercased()
    }

    private static func normalizedLanguageCode(_ language: String) -> String? {
        let normalized = language.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
        guard normalized != "auto", normalized.count >= 2 else { return nil }
        let code = String(normalized.prefix(2))
        return ["en", "es", "pt"].contains(code) ? code : nil
    }

    private static func trimEnd(_ output: inout String) {
        while output.last?.isWhitespace == true {
            output.removeLast()
        }
    }

    private static func apply(
        _ action: Action,
        to output: inout String,
        listIsNumbered: inout Bool,
        listNumber: inout Int,
        joinNext: inout Bool
    ) {
        trimEnd(&output)
        switch action {
        case .punctuation(let mark):
            if !output.isEmpty && output.last != mark {
                output.append(mark)
            }
        case .newlines(let newlines):
            if !output.isEmpty {
                output.append(newlines)
            }
        case .removeLastWord:
            while output.last?.isWhitespace == false {
                output.removeLast()
            }
            trimEnd(&output)
        case .removeClause:
            if let boundary = output.lastIndex(where: { ".!?\n".contains($0) }) {
                output = String(output[...boundary])
            } else {
                output = ""
            }
            trimEnd(&output)
        case .open(let mark):
            if !output.isEmpty && output.last?.isWhitespace == false {
                output.append(" ")
            }
            output.append(mark)
            joinNext = true
        case .close(let mark):
            output.append(mark)
        case .join(let value):
            output.append(value)
            joinNext = true
        case .bullet:
            listIsNumbered = false
            listNumber = 0
            startListItem("- ", output: &output)
        case .numberedItem:
            if !listIsNumbered { listNumber = 0 }
            listIsNumbered = true
            listNumber += 1
            startListItem("\(listNumber). ", output: &output)
        case .nextItem:
            if listIsNumbered {
                listNumber += 1
                startListItem("\(listNumber). ", output: &output)
            } else {
                startListItem("- ", output: &output)
            }
        case .literalOn, .literalOff:
            break
        }
    }

    private static func startListItem(_ prefix: String, output: inout String) {
        trimEnd(&output)
        if !output.isEmpty { output.append("\n") }
        output.append(prefix)
    }
}
