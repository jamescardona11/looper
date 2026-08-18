package com.j11.looper.mobile

import android.text.InputType
import android.view.inputmethod.EditorInfo

internal object DestinationInsertion {
    fun prepare(
        text: String,
        contextBefore: String?,
        inputType: Int,
        imeOptions: Int,
    ): String {
        var body = text.trim()
        if (body.isEmpty()) return ""

        val textClass = inputType and InputType.TYPE_MASK_CLASS == InputType.TYPE_CLASS_TEXT
        val variation = inputType and InputType.TYPE_MASK_VARIATION
        val literal = textClass && variation in setOf(
            InputType.TYPE_TEXT_VARIATION_EMAIL_ADDRESS,
            InputType.TYPE_TEXT_VARIATION_URI,
            InputType.TYPE_TEXT_VARIATION_PASSWORD,
            InputType.TYPE_TEXT_VARIATION_VISIBLE_PASSWORD,
            InputType.TYPE_TEXT_VARIATION_WEB_PASSWORD,
        )
        val action = imeOptions and EditorInfo.IME_MASK_ACTION
        val search = action == EditorInfo.IME_ACTION_SEARCH
        if (search && body.endsWith('.')) body = body.dropLast(1)

        if (!literal && !search) {
            body = when {
                inputType and InputType.TYPE_TEXT_FLAG_CAP_CHARACTERS != 0 -> body.uppercase()
                inputType and InputType.TYPE_TEXT_FLAG_CAP_WORDS != 0 -> uppercaseFirstLetter(body)
                inputType and InputType.TYPE_TEXT_FLAG_CAP_SENTENCES != 0 &&
                    isSentenceBoundary(contextBefore) -> uppercaseFirstLetter(body)
                else -> body
            }
        }

        val prefix = if (
            !literal &&
            contextBefore?.lastOrNull()?.let { !it.isWhitespace() && it !in "([{/@#\"'\n" } == true
        ) {
            " "
        } else {
            ""
        }
        return prefix + body + if (literal) "" else " "
    }

    private fun isSentenceBoundary(value: String?): Boolean {
        val last = value?.trimEnd()?.lastOrNull() ?: return true
        return last in ".!?\n"
    }

    private fun uppercaseFirstLetter(value: String): String {
        val index = value.indexOfFirst(Char::isLetter)
        if (index < 0) return value
        return value.substring(0, index) + value[index].uppercase() + value.substring(index + 1)
    }
}
