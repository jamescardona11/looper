package com.j11.looper.mobile

internal object SpokenEntities {
    data class Match(val consumed: Int, val text: String)

    private val numberValues = mapOf(
        "en" to mapOf(
            "zero" to 0, "one" to 1, "two" to 2, "three" to 3, "four" to 4,
            "five" to 5, "six" to 6, "seven" to 7, "eight" to 8, "nine" to 9,
            "ten" to 10, "eleven" to 11, "twelve" to 12, "thirteen" to 13,
            "fourteen" to 14, "fifteen" to 15, "sixteen" to 16,
            "seventeen" to 17, "eighteen" to 18, "nineteen" to 19,
            "twenty" to 20, "thirty" to 30, "forty" to 40, "fifty" to 50,
            "sixty" to 60, "seventy" to 70, "eighty" to 80, "ninety" to 90,
        ),
        "es" to mapOf(
            "cero" to 0, "uno" to 1, "un" to 1, "una" to 1, "dos" to 2,
            "tres" to 3, "cuatro" to 4, "cinco" to 5, "seis" to 6,
            "siete" to 7, "ocho" to 8, "nueve" to 9, "diez" to 10,
            "once" to 11, "doce" to 12, "trece" to 13, "catorce" to 14,
            "quince" to 15, "dieciséis" to 16, "diecisiete" to 17,
            "dieciocho" to 18, "diecinueve" to 19, "veinte" to 20,
            "veintiuno" to 21, "veintiún" to 21, "veintiuna" to 21,
            "veintidós" to 22, "veintitrés" to 23, "veinticuatro" to 24,
            "veinticinco" to 25, "veintiséis" to 26, "veintisiete" to 27,
            "veintiocho" to 28, "veintinueve" to 29, "treinta" to 30,
            "cuarenta" to 40, "cincuenta" to 50, "sesenta" to 60,
            "setenta" to 70, "ochenta" to 80, "noventa" to 90,
        ),
        "pt" to mapOf(
            "zero" to 0, "um" to 1, "uma" to 1, "dois" to 2, "duas" to 2,
            "três" to 3, "quatro" to 4, "cinco" to 5, "seis" to 6,
            "sete" to 7, "oito" to 8, "nove" to 9, "dez" to 10,
            "onze" to 11, "doze" to 12, "treze" to 13, "catorze" to 14,
            "quatorze" to 14, "quinze" to 15, "dezesseis" to 16,
            "dezasseis" to 16, "dezessete" to 17, "dezassete" to 17,
            "dezoito" to 18, "dezenove" to 19, "vinte" to 20,
            "trinta" to 30, "quarenta" to 40, "cinquenta" to 50,
            "sessenta" to 60, "setenta" to 70, "oitenta" to 80,
            "noventa" to 90,
        ),
    )

    private val months = mapOf(
        "en" to listOf(
            "january", "february", "march", "april", "may", "june",
            "july", "august", "september", "october", "november", "december",
        ),
        "es" to listOf(
            "enero", "febrero", "marzo", "abril", "mayo", "junio",
            "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre",
        ),
        "pt" to listOf(
            "janeiro", "fevereiro", "março", "abril", "maio", "junho",
            "julho", "agosto", "setembro", "outubro", "novembro", "dezembro",
        ),
    )

    private data class Atom(val value: Int, val scale: Int = 1)

    private fun connector(token: String, language: String): Boolean =
        token == mapOf("en" to "and", "es" to "y", "pt" to "e")[language]

    private fun atom(token: String, language: String): Atom? {
        token.toIntOrNull()?.takeIf { it >= 0 }?.let { return Atom(it) }
        if (token in setOf("hundred", "cien", "ciento", "cem", "cento")) {
            return Atom(0, 100)
        }
        if (token == "thousand" || token == "mil") return Atom(0, 1_000)
        return numberValues[language]?.get(token)?.let(::Atom)
    }

    private fun parseNumber(tokens: List<String>, language: String): Int? {
        if (tokens.isEmpty()) return null
        var total = 0
        var current = 0
        var sawNumber = false
        tokens.forEachIndexed { index, token ->
            if (connector(token, language)) {
                if (!sawNumber || index + 1 == tokens.size) return null
                return@forEachIndexed
            }
            val atom = atom(token, language) ?: return null
            if (atom.scale > 1 && !sawNumber) return null
            sawNumber = true
            when (atom.scale) {
                100 -> current = maxOf(current, 1) * 100
                1_000 -> {
                    total += maxOf(current, 1) * 1_000
                    current = 0
                }
                else -> current += atom.value
            }
        }
        return if (sawNumber) total + current else null
    }

    private fun numberPrefixLength(tokens: List<String>, start: Int, language: String): Int {
        var end = start
        while (end < tokens.size && end - start < 10) {
            if (atom(tokens[end], language) == null && !connector(tokens[end], language)) break
            end += 1
        }
        while (end > start && connector(tokens[end - 1], language)) end -= 1
        return end - start
    }

    private fun month(token: String, language: String): Int? {
        val index = months[language]?.indexOf(token) ?: return null
        return (index + 1).takeIf { index >= 0 }
    }

    private fun date(tokens: List<String>, start: Int, language: String): Match? {
        if (language == "en") {
            val month = tokens.getOrNull(start)?.let { month(it, language) } ?: return null
            val length = numberPrefixLength(tokens, start + 1, language)
            for (split in length - 1 downTo 1) {
                val day = parseNumber(tokens.subList(start + 1, start + 1 + split), language)
                val year = parseNumber(tokens.subList(start + 1 + split, start + 1 + length), language)
                if (day != null && year != null && day in 1..31 && year in 1_000..9_999) {
                    return Match(1 + length, "%04d-%02d-%02d".format(year, month, day))
                }
            }
            return null
        }

        val firstDe = (start + 1 until minOf(tokens.size, start + 6))
            .firstOrNull { tokens[it] == "de" } ?: return null
        val day = parseNumber(tokens.subList(start, firstDe), language) ?: return null
        val month = tokens.getOrNull(firstDe + 1)?.let { month(it, language) } ?: return null
        if (tokens.getOrNull(firstDe + 2) != "de") return null
        val yearStart = firstDe + 3
        val yearLength = numberPrefixLength(tokens, yearStart, language)
        val year = parseNumber(tokens.subList(yearStart, yearStart + yearLength), language) ?: return null
        if (day !in 1..31 || year !in 1_000..9_999) return null
        return Match(yearStart + yearLength - start, "%04d-%02d-%02d".format(year, month, day))
    }

    private fun time(tokens: List<String>, start: Int, language: String): Match? {
        val marker = (start + 2 until minOf(tokens.size, start + 7))
            .firstOrNull { tokens[it] == "am" || tokens[it] == "pm" } ?: return null
        for (split in start + 1 until marker) {
            val minuteStart = if (connector(tokens[split], language)) split + 1 else split
            val hour = parseNumber(tokens.subList(start, split), language)
            val minute = parseNumber(tokens.subList(minuteStart, marker), language)
            if (hour != null && minute != null && hour in 1..12 && minute in 0..59) {
                return Match(
                    marker - start + 1,
                    "%d:%02d %s".format(hour, minute, tokens[marker].uppercase()),
                )
            }
        }
        return null
    }

    private fun currency(token: String, language: String): String? = when {
        token == "euro" || token == "euros" -> "€"
        language == "en" && token in setOf("pound", "pounds") -> "£"
        language == "pt" && token in setOf("real", "reais") -> "R\$"
        token in setOf("dólar", "dólares", "dolar", "dolares") ->
            if (language == "pt") "US\$" else "\$"
        language == "en" && token in setOf("dollar", "dollars") -> "\$"
        language == "es" && token in setOf("peso", "pesos") -> "\$"
        else -> null
    }

    fun match(tokens: List<String>, start: Int, language: String): Match? {
        date(tokens, start, language)?.let { return it }
        time(tokens, start, language)?.let { return it }
        val length = numberPrefixLength(tokens, start, language)
        if (length == 0) return null
        val value = parseNumber(tokens.subList(start, start + length), language) ?: return null
        val symbol = tokens.getOrNull(start + length)?.let { currency(it, language) }
        return if (symbol == null) Match(length, value.toString()) else Match(length + 1, "$symbol$value")
    }
}
