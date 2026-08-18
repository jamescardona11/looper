package com.j11.looper.mobile.repos

import android.util.Log
import org.json.JSONArray
import org.json.JSONObject

abstract class BaseGenerateTextRepo {
    abstract fun generateTextSync(system: String?, prompt: String, jsonResponse: Boolean = false): String?
}

class CloudGenerateTextRepo(
    private val config: RepoConfig,
) : BaseGenerateTextRepo() {
    override fun generateTextSync(system: String?, prompt: String, jsonResponse: Boolean): String? {
        val conversation = createConversation() ?: return null
        return try {
            if (!appendPrompt(conversation, prompt)) null else awaitReply(conversation)
        } finally {
            disposeConversation(conversation)
        }
    }

    private fun createConversation(): String? {
        val title = JSONObject().put("title", "Keyboard post-processing")
        val value = call(ConvexFunctionKind.MUTATION, "agent/threads:createThread", title)
        return (value as? String) ?: warnCloud("agent/threads:createThread returned no thread id")
    }

    private fun appendPrompt(thread: String, prompt: String): Boolean {
        val input = JSONObject().put("threadId", thread).put("content", prompt)
        if (call(ConvexFunctionKind.MUTATION, "agent/messages:addUserMessage", input) != null) {
            return true
        }
        warnCloud("agent/messages:addUserMessage failed")
        return false
    }

    private fun awaitReply(thread: String): String? {
        repeat(POLL_LIMIT) {
            Thread.sleep(POLL_DELAY_MS)
            val payload = JSONObject().put("threadId", thread)
            val messages = call(ConvexFunctionKind.QUERY, "agent/messages:list", payload) as? JSONArray
                ?: return warnCloud("agent/messages:list returned no message array")
            val assistant = messages.lastAssistant() ?: return@repeat
            when (assistant.optString("status")) {
                "done" -> assistant.optString("content").takeIf(String::isNotEmpty)?.let { return it }
                "error" -> return warnCloud(
                    "Cloud text generation failed: " +
                        assistant.optString("content").ifEmpty { "assistant error" },
                )
            }
        }
        return warnCloud("Cloud text generation timed out after $POLL_LIMIT polls")
    }

    private fun disposeConversation(thread: String) {
        Thread {
            call(
                ConvexFunctionKind.MUTATION,
                "agent/threads:deleteThread",
                JSONObject().put("threadId", thread),
            )
        }.start()
    }

    private fun call(kind: ConvexFunctionKind, name: String, input: JSONObject): Any? =
        invokeHandlerRawValueSync(config, kind, name, input)
}

class ByokGenerateTextRepo(
    private val apiKey: String,
    provider: String,
    baseUrl: String?,
    modelOverride: String?,
) : BaseGenerateTextRepo() {
    private val destination = TextDestination.resolve(provider, baseUrl, modelOverride)

    override fun generateTextSync(system: String?, prompt: String, jsonResponse: Boolean): String? =
        guardedGeneration(destination.protocol.label) {
            when (destination.protocol) {
                TextProtocol.OPEN_AI -> openAi(system, prompt, jsonResponse)
                TextProtocol.GEMINI -> gemini(system, prompt, jsonResponse)
                TextProtocol.CLAUDE -> claude(system, prompt)
                TextProtocol.AZURE -> azure(system, prompt, jsonResponse)
            }
        }

    private fun openAi(system: String?, prompt: String, wantsJson: Boolean): String? {
        val body = JSONObject()
            .put("model", destination.model)
            .put("messages", buildConversationMessages(system, prompt))
        body.addJsonResponseFormat(wantsJson)
        val response = postJsonSync(destination.url, body, authorization = "Bearer $apiKey")
            ?: return null
        if (!response.successful) return warnProvider("BYOK generate", response)
        return JSONObject(response.body).firstChoiceText()
    }

    private fun gemini(system: String?, prompt: String, wantsJson: Boolean): String? {
        val body = JSONObject().put(
            "contents",
            JSONArray().put(JSONObject().put("parts", textParts(prompt))),
        )
        if (!system.isNullOrBlank()) {
            body.put("system_instruction", JSONObject().put("parts", textParts(system)))
        }
        if (wantsJson) {
            body.put("generationConfig", JSONObject().put("responseMimeType", "application/json"))
        }
        val endpoint = "https://generativelanguage.googleapis.com/v1beta/models/" +
            "${destination.model}:generateContent?key=$apiKey"
        val response = postJsonSync(endpoint, body) ?: return null
        if (!response.successful) return warnProvider("Gemini generate", response)
        return JSONObject(response.body)
            .optJSONArray("candidates")
            ?.optJSONObject(0)
            ?.optJSONObject("content")
            ?.optJSONArray("parts")
            ?.optJSONObject(0)
            ?.optString("text", "")
            ?.trim()
    }

    private fun claude(system: String?, prompt: String): String? {
        val body = JSONObject()
            .put("model", destination.model)
            .put("max_tokens", 4096)
            .put("messages", JSONArray().put(JSONObject().put("role", "user").put("content", prompt)))
        if (!system.isNullOrBlank()) body.put("system", system)
        val response = postJsonSync(
            destination.url,
            body,
            extraHeaders = mapOf("x-api-key" to apiKey, "anthropic-version" to "2023-06-01"),
        ) ?: return null
        if (!response.successful) return warnProvider("Claude generate", response)
        return JSONObject(response.body)
            .optJSONArray("content")
            ?.optJSONObject(0)
            ?.optString("text", "")
    }

    private fun azure(system: String?, prompt: String, wantsJson: Boolean): String? {
        val body = JSONObject().put("messages", buildConversationMessages(system, prompt))
        body.addJsonResponseFormat(wantsJson)
        val response = postJsonSync(
            destination.url,
            body,
            extraHeaders = mapOf("api-key" to apiKey),
        ) ?: return null
        if (!response.successful) return warnProvider("Azure OpenAI generate", response)
        return JSONObject(response.body).firstChoiceText()
    }
}

internal enum class TextProtocol(val label: String) {
    OPEN_AI("BYOK generate"),
    GEMINI("Gemini generate"),
    CLAUDE("Claude generate"),
    AZURE("Azure OpenAI generate"),
}

internal data class TextDestination(
    val protocol: TextProtocol,
    val url: String,
    val model: String,
) {
    companion object {
        fun resolve(provider: String, baseUrl: String?, override: String?): TextDestination {
            val base = baseUrl.orEmpty().trimEnd('/')
            return when (provider) {
                "groq" -> openAi("https://api.groq.com/openai/v1/chat/completions", override ?: "llama-3.3-70b-versatile")
                "deepseek" -> openAi("https://api.deepseek.com/chat/completions", override ?: "deepseek-chat")
                "openRouter" -> openAi("https://openrouter.ai/api/v1/chat/completions", override ?: "openai/gpt-4o-mini")
                "openaiCompatible" -> openAi("$base/chat/completions", override ?: "gpt-4o-mini")
                "cerebras" -> openAi("https://api.cerebras.ai/v1/chat/completions", override ?: "llama-3.3-70b")
                "ollama" -> openAi(
                    "${(baseUrl ?: "http://localhost:11434").trimEnd('/')}/v1/chat/completions",
                    override ?: "llama3",
                )
                "gemini" -> TextDestination(TextProtocol.GEMINI, "", override ?: "gemini-2.0-flash")
                "claude" -> TextDestination(TextProtocol.CLAUDE, "https://api.anthropic.com/v1/messages", override ?: "claude-sonnet-4-20250514")
                "azure" -> {
                    val model = override ?: "gpt-4o-mini"
                    TextDestination(
                        TextProtocol.AZURE,
                        "$base/openai/deployments/$model/chat/completions?api-version=2024-08-01-preview",
                        model,
                    )
                }
                else -> openAi("https://api.openai.com/v1/chat/completions", override ?: "gpt-4o-mini")
            }
        }

        private fun openAi(url: String, model: String) =
            TextDestination(TextProtocol.OPEN_AI, url, model)
    }
}

internal fun buildConversationMessages(system: String?, user: String): JSONArray {
    val result = JSONArray()
    if (!system.isNullOrBlank()) result.put(JSONObject().put("role", "system").put("content", system))
    return result.put(JSONObject().put("role", "user").put("content", user))
}

private fun textParts(text: String): JSONArray =
    JSONArray().put(JSONObject().put("text", text))

internal fun JSONObject.addJsonResponseFormat(enabled: Boolean) {
    if (enabled) put("response_format", JSONObject().put("type", "json_object"))
}

private fun JSONObject.firstChoiceText(): String? =
    optJSONArray("choices")
        ?.optJSONObject(0)
        ?.optJSONObject("message")
        ?.optString("content", "")

private fun JSONArray.lastAssistant(): JSONObject? {
    for (index in length() - 1 downTo 0) {
        val row = optJSONObject(index) ?: continue
        if (row.optString("role") == "assistant") return row
    }
    return null
}

private val HttpResponse.successful: Boolean
    get() = status in 200..299

private inline fun guardedGeneration(operation: String, block: () -> String?): String? =
    try {
        block()
    } catch (error: Exception) {
        warnCloud("$operation failed: ${error.message}")
    }

private fun warnProvider(operation: String, response: HttpResponse): String? =
    warnCloud("$operation: HTTP ${response.status} ${response.body.take(200)}")

private fun warnCloud(message: String): String? {
    Log.w(GENERATION_TAG, message)
    return null
}

private const val GENERATION_TAG = "LooperGenerateText"
private const val POLL_DELAY_MS = 500L
private const val POLL_LIMIT = 20
