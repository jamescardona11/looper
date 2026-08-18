package com.j11.looper.mobile

import java.text.DateFormat
import java.util.Date
import java.util.Locale

internal data class KeyboardSnippet(
    val trigger: String,
    val expansion: String,
)

internal object SnippetExpansion {
    private const val MAX_DYNAMIC_VALUE_LENGTH = 20_000
    private val variablePattern = Regex(
        "\\{\\{\\s*(DATE|TIME|CLIPBOARD|APP|SELECTION)\\s*\\}\\}",
        RegexOption.IGNORE_CASE,
    )

    fun requiresClipboard(snippets: List<KeyboardSnippet>, text: String): Boolean {
        return snippets.any { snippet ->
            Regex("(?i)\\b${Regex.escape(snippet.trigger)}\\b").containsMatchIn(text) &&
                variablePattern.findAll(snippet.expansion).any { match ->
                    match.groupValues[1].equals("CLIPBOARD", ignoreCase = true)
                }
        }
    }

    fun apply(
        text: String,
        snippets: List<KeyboardSnippet>,
        now: Date = Date(),
        clipboard: String?,
        app: String?,
        selection: String?,
    ): String {
        var result = text
        for (snippet in snippets) {
            val pattern = Regex(
                "(?i)\\b${Regex.escape(snippet.trigger)}\\b",
            )
            val expansion = expandVariables(
                snippet.expansion,
                now,
                clipboard,
                app,
                selection,
            )
            result = pattern.replace(result) { expansion }
        }
        return result
    }

    private fun expandVariables(
        template: String,
        now: Date,
        clipboard: String?,
        app: String?,
        selection: String?,
    ): String {
        val date = DateFormat.getDateInstance(DateFormat.MEDIUM, Locale.getDefault()).format(now)
        val time = DateFormat.getTimeInstance(DateFormat.SHORT, Locale.getDefault()).format(now)
        return variablePattern.replace(template) { match ->
            when (match.groupValues[1].uppercase(Locale.ROOT)) {
                "DATE" -> date
                "TIME" -> time
                "CLIPBOARD" -> bounded(clipboard) ?: match.value
                "APP" -> bounded(app) ?: match.value
                "SELECTION" -> bounded(selection) ?: match.value
                else -> match.value
            }
        }
    }

    private fun bounded(value: String?): String? {
        val trimmed = value?.trim().orEmpty()
        return trimmed.takeIf(String::isNotEmpty)?.take(MAX_DYNAMIC_VALUE_LENGTH)
    }
}
