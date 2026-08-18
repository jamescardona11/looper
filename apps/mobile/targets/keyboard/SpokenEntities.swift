import Foundation

enum SpokenEntities {
    struct Match {
        let consumed: Int
        let text: String
    }

    private struct Atom {
        let value: Int
        let scale: Int

        init(_ value: Int, scale: Int = 1) {
            self.value = value
            self.scale = scale
        }
    }

    private static let numberValues: [String: [String: Int]] = [
        "en": [
            "zero": 0, "one": 1, "two": 2, "three": 3, "four": 4, "five": 5,
            "six": 6, "seven": 7, "eight": 8, "nine": 9, "ten": 10,
            "eleven": 11, "twelve": 12, "thirteen": 13, "fourteen": 14,
            "fifteen": 15, "sixteen": 16, "seventeen": 17, "eighteen": 18,
            "nineteen": 19, "twenty": 20, "thirty": 30, "forty": 40,
            "fifty": 50, "sixty": 60, "seventy": 70, "eighty": 80, "ninety": 90
        ],
        "es": [
            "cero": 0, "uno": 1, "un": 1, "una": 1, "dos": 2, "tres": 3,
            "cuatro": 4, "cinco": 5, "seis": 6, "siete": 7, "ocho": 8,
            "nueve": 9, "diez": 10, "once": 11, "doce": 12, "trece": 13,
            "catorce": 14, "quince": 15, "dieciséis": 16, "diecisiete": 17,
            "dieciocho": 18, "diecinueve": 19, "veinte": 20, "veintiuno": 21,
            "veintiún": 21, "veintiuna": 21, "veintidós": 22, "veintitrés": 23,
            "veinticuatro": 24, "veinticinco": 25, "veintiséis": 26,
            "veintisiete": 27, "veintiocho": 28, "veintinueve": 29,
            "treinta": 30, "cuarenta": 40, "cincuenta": 50, "sesenta": 60,
            "setenta": 70, "ochenta": 80, "noventa": 90
        ],
        "pt": [
            "zero": 0, "um": 1, "uma": 1, "dois": 2, "duas": 2, "três": 3,
            "quatro": 4, "cinco": 5, "seis": 6, "sete": 7, "oito": 8,
            "nove": 9, "dez": 10, "onze": 11, "doze": 12, "treze": 13,
            "catorze": 14, "quatorze": 14, "quinze": 15, "dezesseis": 16,
            "dezasseis": 16, "dezessete": 17, "dezassete": 17, "dezoito": 18,
            "dezenove": 19, "vinte": 20, "trinta": 30, "quarenta": 40,
            "cinquenta": 50, "sessenta": 60, "setenta": 70, "oitenta": 80,
            "noventa": 90
        ]
    ]

    private static let months: [String: [String]] = [
        "en": [
            "january", "february", "march", "april", "may", "june",
            "july", "august", "september", "october", "november", "december"
        ],
        "es": [
            "enero", "febrero", "marzo", "abril", "mayo", "junio",
            "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"
        ],
        "pt": [
            "janeiro", "fevereiro", "março", "abril", "maio", "junho",
            "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"
        ]
    ]

    private static func isConnector(_ token: String, language: String) -> Bool {
        token == ["en": "and", "es": "y", "pt": "e"][language]
    }

    private static func atom(_ token: String, language: String) -> Atom? {
        if let value = Int(token), value >= 0 { return Atom(value) }
        if ["hundred", "cien", "ciento", "cem", "cento"].contains(token) {
            return Atom(0, scale: 100)
        }
        if token == "thousand" || token == "mil" { return Atom(0, scale: 1_000) }
        return numberValues[language]?[token].map { Atom($0) }
    }

    private static func parseNumber(_ tokens: ArraySlice<String>, language: String) -> Int? {
        guard !tokens.isEmpty else { return nil }
        var total = 0
        var current = 0
        var sawNumber = false
        for (offset, token) in tokens.enumerated() {
            if isConnector(token, language: language) {
                guard sawNumber, offset + 1 < tokens.count else { return nil }
                continue
            }
            guard let atom = atom(token, language: language) else { return nil }
            guard atom.scale == 1 || sawNumber else { return nil }
            sawNumber = true
            switch atom.scale {
            case 100:
                current = max(current, 1) * 100
            case 1_000:
                total += max(current, 1) * 1_000
                current = 0
            default:
                current += atom.value
            }
        }
        return sawNumber ? total + current : nil
    }

    private static func numberPrefixLength(
        _ tokens: [String],
        start: Int,
        language: String
    ) -> Int {
        var end = start
        while end < tokens.count, end - start < 10 {
            if atom(tokens[end], language: language) == nil,
               !isConnector(tokens[end], language: language) {
                break
            }
            end += 1
        }
        while end > start, isConnector(tokens[end - 1], language: language) { end -= 1 }
        return end - start
    }

    private static func month(_ token: String, language: String) -> Int? {
        guard let index = months[language]?.firstIndex(of: token) else { return nil }
        return index + 1
    }

    private static func date(_ tokens: [String], start: Int, language: String) -> Match? {
        if language == "en" {
            guard start < tokens.count,
                  let month = month(tokens[start], language: language) else { return nil }
            let length = numberPrefixLength(tokens, start: start + 1, language: language)
            guard length >= 2 else { return nil }
            for split in stride(from: length - 1, through: 1, by: -1) {
                let day = parseNumber(tokens[(start + 1)..<(start + 1 + split)], language: language)
                let year = parseNumber(
                    tokens[(start + 1 + split)..<(start + 1 + length)],
                    language: language
                )
                if let day, let year, (1...31).contains(day), (1_000...9_999).contains(year) {
                    return Match(
                        consumed: 1 + length,
                        text: String(format: "%04d-%02d-%02d", year, month, day)
                    )
                }
            }
            return nil
        }

        let limit = min(tokens.count, start + 6)
        guard start + 1 < limit,
              let firstDe = (start + 1..<limit).first(where: { tokens[$0] == "de" }),
              let day = parseNumber(tokens[start..<firstDe], language: language),
              let month = tokens.indices.contains(firstDe + 1)
                ? month(tokens[firstDe + 1], language: language) : nil,
              tokens.indices.contains(firstDe + 2), tokens[firstDe + 2] == "de" else {
            return nil
        }
        let yearStart = firstDe + 3
        let yearLength = numberPrefixLength(tokens, start: yearStart, language: language)
        guard yearLength > 0,
              let year = parseNumber(
                tokens[yearStart..<(yearStart + yearLength)],
                language: language
              ),
              (1...31).contains(day), (1_000...9_999).contains(year) else { return nil }
        return Match(
            consumed: yearStart + yearLength - start,
            text: String(format: "%04d-%02d-%02d", year, month, day)
        )
    }

    private static func time(_ tokens: [String], start: Int, language: String) -> Match? {
        let limit = min(tokens.count, start + 7)
        guard start + 2 < limit,
              let marker = (start + 2..<limit).first(where: {
                tokens[$0] == "am" || tokens[$0] == "pm"
              }) else { return nil }
        for split in start + 1..<marker {
            let minuteStart = isConnector(tokens[split], language: language) ? split + 1 : split
            guard minuteStart < marker else { continue }
            let hour = parseNumber(tokens[start..<split], language: language)
            let minute = parseNumber(tokens[minuteStart..<marker], language: language)
            if let hour, let minute, (1...12).contains(hour), (0...59).contains(minute) {
                return Match(
                    consumed: marker - start + 1,
                    text: String(
                        format: "%d:%02d %@",
                        hour,
                        minute,
                        tokens[marker].uppercased()
                    )
                )
            }
        }
        return nil
    }

    private static func currency(_ token: String, language: String) -> String? {
        if token == "euro" || token == "euros" { return "€" }
        if language == "en", ["pound", "pounds"].contains(token) { return "£" }
        if language == "pt", ["real", "reais"].contains(token) { return "R$" }
        if ["dólar", "dólares", "dolar", "dolares"].contains(token) {
            return language == "pt" ? "US$" : "$"
        }
        if language == "en", ["dollar", "dollars"].contains(token) { return "$" }
        if language == "es", ["peso", "pesos"].contains(token) { return "$" }
        return nil
    }

    static func match(_ tokens: [String], start: Int, language: String) -> Match? {
        if let date = date(tokens, start: start, language: language) { return date }
        if let time = time(tokens, start: start, language: language) { return time }
        let length = numberPrefixLength(tokens, start: start, language: language)
        guard length > 0,
              let value = parseNumber(tokens[start..<(start + length)], language: language) else {
            return nil
        }
        if start + length < tokens.count,
           let symbol = currency(tokens[start + length], language: language) {
            return Match(consumed: length + 1, text: "\(symbol)\(value)")
        }
        return Match(consumed: length, text: "\(value)")
    }
}
