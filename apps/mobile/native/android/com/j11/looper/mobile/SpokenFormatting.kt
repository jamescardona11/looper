package com.j11.looper.mobile

import java.util.Locale

internal object SpokenFormatting {
    private enum class Action {
        PUNCTUATION,
        NEWLINES,
        REMOVE_LAST_WORD,
        REMOVE_CLAUSE,
        OPEN,
        CLOSE,
        JOIN,
        BULLET,
        NUMBERED_ITEM,
        NEXT_ITEM,
        LITERAL_ON,
        LITERAL_OFF,
    }

    private enum class ListKind { BULLET, NUMBERED }

    private data class FormattingState(
        var literalMode: Boolean = false,
        var listKind: ListKind? = null,
        var listNumber: Int = 0,
        var joinNext: Boolean = false,
    )

    private data class Command(
        val languages: Set<String>,
        val phrase: List<String>,
        val action: Action,
        val value: String = "",
    )

    private val commands = listOf(
        Command(setOf("en"), listOf("end", "literal", "mode"), Action.LITERAL_OFF),
        Command(setOf("es"), listOf("fin", "modo", "literal"), Action.LITERAL_OFF),
        Command(setOf("pt"), listOf("fim", "modo", "literal"), Action.LITERAL_OFF),
        Command(setOf("en"), listOf("literal", "mode"), Action.LITERAL_ON),
        Command(setOf("es", "pt"), listOf("modo", "literal"), Action.LITERAL_ON),
        Command(setOf("en"), listOf("numbered", "item"), Action.NUMBERED_ITEM),
        Command(setOf("es"), listOf("elemento", "numerado"), Action.NUMBERED_ITEM),
        Command(setOf("pt"), listOf("item", "numerado"), Action.NUMBERED_ITEM),
        Command(setOf("en"), listOf("bullet", "point"), Action.BULLET),
        Command(setOf("es"), listOf("punto", "de", "lista"), Action.BULLET),
        Command(setOf("pt"), listOf("ponto", "de", "lista"), Action.BULLET),
        Command(setOf("en"), listOf("next", "item"), Action.NEXT_ITEM),
        Command(setOf("es"), listOf("siguiente", "elemento"), Action.NEXT_ITEM),
        Command(setOf("pt"), listOf("próximo", "item"), Action.NEXT_ITEM),
        Command(setOf("en"), listOf("open", "parenthesis"), Action.OPEN, "("),
        Command(setOf("es"), listOf("abre", "paréntesis"), Action.OPEN, "("),
        Command(setOf("pt"), listOf("abre", "parênteses"), Action.OPEN, "("),
        Command(setOf("en"), listOf("close", "parenthesis"), Action.CLOSE, ")"),
        Command(setOf("es"), listOf("cierra", "paréntesis"), Action.CLOSE, ")"),
        Command(setOf("pt"), listOf("fecha", "parênteses"), Action.CLOSE, ")"),
        Command(setOf("en"), listOf("open", "bracket"), Action.OPEN, "["),
        Command(setOf("es"), listOf("abre", "corchete"), Action.OPEN, "["),
        Command(setOf("pt"), listOf("abre", "colchete"), Action.OPEN, "["),
        Command(setOf("en"), listOf("close", "bracket"), Action.CLOSE, "]"),
        Command(setOf("es"), listOf("cierra", "corchete"), Action.CLOSE, "]"),
        Command(setOf("pt"), listOf("fecha", "colchete"), Action.CLOSE, "]"),
        Command(setOf("en"), listOf("at", "sign"), Action.JOIN, "@"),
        Command(setOf("es", "pt"), listOf("arroba"), Action.JOIN, "@"),
        Command(setOf("en"), listOf("dot"), Action.JOIN, "."),
        Command(setOf("es"), listOf("punto", "sin", "espacio"), Action.JOIN, "."),
        Command(setOf("pt"), listOf("ponto", "sem", "espaço"), Action.JOIN, "."),
        Command(setOf("en"), listOf("slash"), Action.JOIN, "/"),
        Command(setOf("es", "pt"), listOf("barra"), Action.JOIN, "/"),
        Command(setOf("es"), listOf("signo", "de", "interrogación"), Action.PUNCTUATION, "?"),
        Command(setOf("es"), listOf("signo", "de", "exclamación"), Action.PUNCTUATION, "!"),
        Command(setOf("pt"), listOf("ponto", "de", "interrogação"), Action.PUNCTUATION, "?"),
        Command(setOf("pt"), listOf("ponto", "de", "exclamação"), Action.PUNCTUATION, "!"),
        Command(setOf("en"), listOf("exclamation", "point"), Action.PUNCTUATION, "!"),
        Command(setOf("en"), listOf("exclamation", "mark"), Action.PUNCTUATION, "!"),
        Command(setOf("en"), listOf("question", "mark"), Action.PUNCTUATION, "?"),
        Command(setOf("en"), listOf("full", "stop"), Action.PUNCTUATION, "."),
        Command(setOf("en"), listOf("new", "paragraph"), Action.NEWLINES, "\n\n"),
        Command(setOf("es"), listOf("nuevo", "párrafo"), Action.NEWLINES, "\n\n"),
        Command(setOf("pt"), listOf("novo", "parágrafo"), Action.NEWLINES, "\n\n"),
        Command(setOf("en"), listOf("new", "line"), Action.NEWLINES, "\n"),
        Command(setOf("es"), listOf("nueva", "línea"), Action.NEWLINES, "\n"),
        Command(setOf("pt"), listOf("nova", "linha"), Action.NEWLINES, "\n"),
        Command(setOf("es"), listOf("punto", "y", "coma"), Action.PUNCTUATION, ";"),
        Command(setOf("pt"), listOf("ponto", "e", "vírgula"), Action.PUNCTUATION, ";"),
        Command(setOf("es"), listOf("dos", "puntos"), Action.PUNCTUATION, ":"),
        Command(setOf("pt"), listOf("dois", "pontos"), Action.PUNCTUATION, ":"),
        Command(setOf("en"), listOf("no", "wait"), Action.REMOVE_LAST_WORD),
        Command(setOf("en"), listOf("i", "mean"), Action.REMOVE_LAST_WORD),
        Command(setOf("es"), listOf("mejor", "dicho"), Action.REMOVE_LAST_WORD),
        Command(setOf("es"), listOf("quise", "decir"), Action.REMOVE_LAST_WORD),
        Command(setOf("pt"), listOf("quer", "dizer"), Action.REMOVE_LAST_WORD),
        Command(setOf("pt"), listOf("melhor", "dizendo"), Action.REMOVE_LAST_WORD),
        Command(setOf("en"), listOf("scratch", "that"), Action.REMOVE_CLAUSE),
        Command(setOf("es"), listOf("borra", "eso"), Action.REMOVE_CLAUSE),
        Command(setOf("pt"), listOf("apaga", "isso"), Action.REMOVE_CLAUSE),
        Command(setOf("en"), listOf("comma"), Action.PUNCTUATION, ","),
        Command(setOf("en"), listOf("period"), Action.PUNCTUATION, "."),
        Command(setOf("en"), listOf("colon"), Action.PUNCTUATION, ":"),
        Command(setOf("en"), listOf("semicolon"), Action.PUNCTUATION, ";"),
        Command(setOf("es"), listOf("coma"), Action.PUNCTUATION, ","),
        Command(setOf("es"), listOf("punto"), Action.PUNCTUATION, "."),
        Command(setOf("pt"), listOf("vírgula"), Action.PUNCTUATION, ","),
        Command(setOf("pt"), listOf("ponto"), Action.PUNCTUATION, "."),
    )

    fun apply(transcript: String, language: String): String {
        val rawTokens = transcript.trim().split(Regex("\\s+")).filter(String::isNotEmpty)
        if (rawTokens.isEmpty()) return ""
        val tokens = rawTokens.map(::normalizeToken)
        val languageCode = languageCode(language)
        val output = StringBuilder(transcript.length)
        val state = FormattingState()
        var index = 0

        while (index < rawTokens.size) {
            val command = commands.firstOrNull { candidate ->
                (languageCode == null || languageCode in candidate.languages) &&
                    index + candidate.phrase.size <= tokens.size &&
                    tokens.subList(index, index + candidate.phrase.size) == candidate.phrase
            }
            if (command != null) {
                if (state.literalMode) {
                    if (command.action == Action.LITERAL_OFF) {
                        state.literalMode = false
                        index += command.phrase.size
                        continue
                    }
                } else {
                    if (command.action == Action.LITERAL_ON) {
                        state.literalMode = true
                        index += command.phrase.size
                        continue
                    }
                    applyCommand(output, command, state)
                    index += command.phrase.size
                    continue
                }
            }

            if (!state.literalMode && languageCode != null) {
                val entity = SpokenEntities.match(tokens, index, languageCode)
                if (entity != null) {
                    if (output.isNotEmpty() && !output.last().isWhitespace() && !state.joinNext) {
                        output.append(' ')
                    }
                    output.append(entity.text)
                    state.joinNext = false
                    index += entity.consumed
                    continue
                }
            }

            if (output.isNotEmpty() && !output.last().isWhitespace() && !state.joinNext) {
                output.append(' ')
            }
            output.append(rawTokens[index])
            state.joinNext = false
            index += 1
        }
        return output.toString().trim()
    }

    private fun normalizeToken(token: String): String =
        token.trim { !it.isLetterOrDigit() }.lowercase(Locale.ROOT)

    private fun languageCode(language: String): String? {
        val normalized = language.trim().lowercase(Locale.ROOT)
        if (normalized.isEmpty() || normalized == "auto" || normalized.length < 2) return null
        return normalized.take(2).takeIf { it in setOf("en", "es", "pt") }
    }

    private fun trimEnd(output: StringBuilder) {
        while (output.isNotEmpty() && output.last().isWhitespace()) {
            output.deleteCharAt(output.lastIndex)
        }
    }

    private fun applyCommand(
        output: StringBuilder,
        command: Command,
        state: FormattingState,
    ) {
        when (command.action) {
            Action.PUNCTUATION -> {
                trimEnd(output)
                if (output.isNotEmpty() && !output.endsWith(command.value)) output.append(command.value)
            }
            Action.NEWLINES -> {
                trimEnd(output)
                if (output.isNotEmpty()) output.append(command.value)
            }
            Action.REMOVE_LAST_WORD -> {
                trimEnd(output)
                while (output.isNotEmpty() && !output.last().isWhitespace()) {
                    output.deleteCharAt(output.lastIndex)
                }
                trimEnd(output)
            }
            Action.REMOVE_CLAUSE -> {
                trimEnd(output)
                val keep = output.indexOfLast { it == '.' || it == '!' || it == '?' || it == '\n' }
                output.setLength(if (keep < 0) 0 else keep + 1)
                trimEnd(output)
            }
            Action.OPEN -> {
                trimEnd(output)
                if (output.isNotEmpty()) output.append(' ')
                output.append(command.value)
                state.joinNext = true
            }
            Action.CLOSE -> {
                trimEnd(output)
                output.append(command.value)
            }
            Action.JOIN -> {
                trimEnd(output)
                output.append(command.value)
                state.joinNext = true
            }
            Action.BULLET -> {
                state.listKind = ListKind.BULLET
                state.listNumber = 0
                startListItem(output, "- ")
            }
            Action.NUMBERED_ITEM -> {
                if (state.listKind != ListKind.NUMBERED) state.listNumber = 0
                state.listKind = ListKind.NUMBERED
                state.listNumber += 1
                startListItem(output, "${state.listNumber}. ")
            }
            Action.NEXT_ITEM -> {
                if (state.listKind == ListKind.NUMBERED) {
                    state.listNumber += 1
                    startListItem(output, "${state.listNumber}. ")
                } else {
                    state.listKind = ListKind.BULLET
                    startListItem(output, "- ")
                }
            }
            Action.LITERAL_ON, Action.LITERAL_OFF -> Unit
        }
    }

    private fun startListItem(output: StringBuilder, prefix: String) {
        trimEnd(output)
        if (output.isNotEmpty()) output.append('\n')
        output.append(prefix)
    }
}
