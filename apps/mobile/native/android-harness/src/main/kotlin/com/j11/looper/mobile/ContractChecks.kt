package com.j11.looper.mobile

import com.j11.looper.mobile.repos.SttDestination
import com.j11.looper.mobile.repos.SttProtocol
import com.j11.looper.mobile.repos.TextDestination
import com.j11.looper.mobile.repos.TextProtocol
import com.j11.looper.mobile.repos.MultipartAudio
import com.j11.looper.mobile.repos.ConvexFunctionKind
import com.j11.looper.mobile.repos.ConvexWire
import com.j11.looper.mobile.repos.HttpResponse
import com.j11.looper.mobile.repos.RepoConfig
import com.j11.looper.mobile.repos.UploadDestination
import com.j11.looper.mobile.repos.addJsonResponseFormat
import com.j11.looper.mobile.repos.buildConversationMessages
import com.j11.looper.mobile.repos.postBytesSync
import com.j11.looper.mobile.repos.postJsonSync
import com.sun.net.httpserver.HttpExchange
import com.sun.net.httpserver.HttpServer
import org.json.JSONObject
import java.io.ByteArrayOutputStream
import java.net.InetSocketAddress

private fun expect(value: Boolean, message: String) {
    check(value) { message }
}

private fun providerRoutingContracts() {
    expect(
        SttDestination.resolve("groq", null, null) == SttDestination(
            SttProtocol.WHISPER_MULTIPART,
            "https://api.groq.com/openai/v1/audio/transcriptions",
            "whisper-large-v3",
        ),
        "Groq STT routing changed",
    )
    expect(
        SttDestination.resolve("ollama", null, null).url ==
            "http://localhost:11434/v1/audio/transcriptions",
        "Ollama STT default changed",
    )
    expect(
        SttDestination.resolve("ollama", "", null).url == "/v1/audio/transcriptions",
        "Explicit empty Ollama STT base must remain distinct from a missing base",
    )
    expect(
        SttDestination.resolve("gemini", "ignored", "gemini-custom").protocol ==
            SttProtocol.GEMINI_INLINE,
        "Gemini STT routing changed",
    )
    expect(
        TextDestination.resolve("deepseek", null, null).model == "deepseek-chat",
        "DeepSeek model default changed",
    )
    expect(
        TextDestination.resolve("ollama", null, null).url ==
            "http://localhost:11434/v1/chat/completions",
        "Ollama text endpoint changed",
    )
    expect(
        TextDestination.resolve("ollama", "", null).url == "/v1/chat/completions",
        "Explicit empty Ollama text base must remain distinct from a missing base",
    )
    expect(
        TextDestination.resolve("claude", null, null).protocol == TextProtocol.CLAUDE,
        "Claude protocol changed",
    )
    expect(
        TextDestination.resolve("azure", "https://example.test/", "deployment").url ==
            "https://example.test/openai/deployments/deployment/chat/completions?api-version=2024-08-01-preview",
        "Azure text endpoint changed",
    )
}

private fun wireContracts() {
    val messages = buildConversationMessages("system", "user")
    expect(messages.length() == 2, "System and user messages must both be sent")
    expect(messages.getJSONObject(0).getString("role") == "system", "System message order changed")
    expect(messages.getJSONObject(1).getString("content") == "user", "User message payload changed")
    val payload = JSONObject()
    payload.addJsonResponseFormat(true)
    expect(
        payload.getJSONObject("response_format").getString("type") == "json_object",
        "OpenAI JSON response format changed",
    )

    val bytes = ByteArrayOutputStream()
    MultipartAudio("boundary", bytes)
        .file("audio".toByteArray())
        .field("model", "whisper")
        .optionalField("language", "es")
        .finish()
    val multipart = bytes.toString(Charsets.UTF_8.name())
    expect(multipart.contains("filename=\"audio.m4a\"\r\nContent-Type: audio/mp4"), "Audio part changed")
    expect(multipart.contains("name=\"model\"\r\n\r\nwhisper\r\n"), "Model field changed")
    expect(multipart.endsWith("--boundary--\r\n"), "Multipart terminator changed")
}

private fun apiUtilityContracts() {
    val arguments = JSONObject().put("threadId", "thread")
    val call = ConvexWire.call(
        RepoConfig("https://example.convex.cloud", "token"),
        ConvexFunctionKind.QUERY,
        "agent/messages:list",
        arguments,
    )
    expect(call.destination == "https://example.convex.cloud/api/query", "Convex endpoint changed")
    expect(call.authorization == "Bearer token", "Convex authorization changed")
    expect(call.payload.getString("path") == "agent/messages:list", "Convex path changed")
    expect(call.payload.getString("format") == "convex_encoded_json", "Convex format changed")
    expect(
        call.payload.getJSONArray("args").getJSONObject(0).getString("threadId") == "thread",
        "Convex argument envelope changed",
    )
    expect(
        ConvexWire.readValue("operation", HttpResponse(200, "{\"status\":\"success\",\"value\":\"ok\"}")) == "ok",
        "Convex scalar decoding changed",
    )

    expect(
        UploadDestination.resolve(
            "http://127.0.0.1:3210/api/storage/upload?token=one",
            "https://deployment.convex.cloud",
        ) == "https://deployment.convex.cloud/api/storage/upload?token=one",
        "Loopback upload rewriting changed",
    )
    expect(
        UploadDestination.resolve(
            "https://uploads.example.test/file",
            "https://deployment.convex.cloud",
        ) == "https://uploads.example.test/file",
        "External upload URLs must stay intact",
    )
    expect(
        UploadDestination.resolve(
            "http://localhost:3210/file",
            "http://127.0.0.1:3210",
        ) == "http://localhost:3210/file",
        "Local-to-local upload URLs must stay intact",
    )
    expect(
        UploadDestination.resolve("not a URL", "https://deployment.convex.cloud") == "not a URL",
        "Malformed upload URLs must fall back unchanged",
    )

    val server = HttpServer.create(InetSocketAddress("127.0.0.1", 0), 0)
    var jsonExchange: CapturedExchange? = null
    var bytesExchange: CapturedExchange? = null
    server.createContext("/json") { exchange ->
        jsonExchange = exchange.capture()
        exchange.respond(201, "json-response")
    }
    server.createContext("/bytes") { exchange ->
        bytesExchange = exchange.capture()
        exchange.respond(418, "byte-error")
    }
    server.start()
    try {
        val base = "http://127.0.0.1:${server.address.port}"
        val jsonResponse = postJsonSync(
            "$base/json",
            JSONObject().put("value", 42),
            authorization = "Bearer secret",
            extraHeaders = mapOf("X-Contract" to "json", "Content-Type" to "application/custom"),
        )
        expect(jsonResponse == HttpResponse(201, "json-response"), "JSON HTTP response changed")
        expect(jsonExchange?.method == "POST", "JSON request method changed")
        expect(jsonExchange?.body == "{\"value\":42}", "JSON request body changed")
        expect(jsonExchange?.headers?.get("Authorization") == "Bearer secret", "Authorization header changed")
        expect(jsonExchange?.headers?.get("Content-type") == "application/custom", "Header overrides changed")

        val bytesResponse = postBytesSync(
            "$base/bytes",
            "audio".toByteArray(),
            "audio/mp4",
            mapOf("X-Contract" to "bytes"),
        )
        expect(bytesResponse == HttpResponse(418, "byte-error"), "Byte error response changed")
        expect(bytesExchange?.body == "audio", "Byte request body changed")
        expect(bytesExchange?.headers?.get("Content-type") == "audio/mp4", "Byte content type changed")
    } finally {
        server.stop(0)
    }
}

private data class CapturedExchange(
    val method: String,
    val body: String,
    val headers: Map<String, String>,
)

private fun HttpExchange.capture(): CapturedExchange = CapturedExchange(
    requestMethod,
    requestBody.bufferedReader().use { it.readText() },
    requestHeaders.entries.associate { it.key to it.value.joinToString(",") },
)

private fun HttpExchange.respond(status: Int, body: String) {
    val content = body.toByteArray()
    sendResponseHeaders(status, content.size.toLong())
    responseBody.use { it.write(content) }
}

private fun workflowContracts() {
    val manual = KeyboardWorkflow(
        "manual",
        "Manual",
        true,
        "manual",
        "",
        "dictation",
        "auto",
        null,
        "polish",
        null,
        false,
        "insert",
        false,
    )
    val bundle = manual.copy(id = "bundle", trigger = "bundle_id", triggerValue = "com.example")
    expect(
        KeyboardPolicy.activeWorkflow("com.example", listOf(bundle, manual), "manual") == manual,
        "Manual workflow must win over bundle matching",
    )
    expect(
        KeyboardPolicy.activeWorkflow("COM.EXAMPLE", listOf(bundle), null) == bundle,
        "Bundle matching must remain case insensitive",
    )
    val tones = mapOf("default" to KeyboardTone("Polished", "prompt"))
    expect(
        KeyboardPolicy.toneId(manual, "fallback", tones) == "default",
        "Smart-mode preset mapping changed",
    )
}

private fun promptContracts() {
    val prompt = KeyboardPolicy.transcriptionPrompt(
        listOf("term", "replacement"),
        mapOf(
            "term" to KeyboardTerm("  J11\u0000   Looper ", "", false),
            "replacement" to KeyboardTerm("old  phrase", "new phrase", true),
        ),
        "James",
        "zh-CN",
    )
    expect(prompt.startsWith("以下是普通话的句子。\n\nGlossary: Looper, James, J11 Looper"), "Localized glossary changed")
    expect(prompt.contains("old phrase -> new phrase"), "Replacement prompt changed")
    expect(KeyboardPolicy.whisperLanguage("pt-BR") == "pt", "Whisper language mapping changed")
    expect(KeyboardPolicy.whisperLanguage("auto") == "auto", "Automatic language mapping changed")

    val rewrite = KeyboardPolicy.postProcessingPrompt("hello", "warm", "email", "James", "en")
    expect(rewrite.contains(LooperIME.STYLE_INSTRUCTIONS_OPEN), "Tone instructions disappeared")
    expect(rewrite.contains(LooperIME.FORMAT_INSTRUCTIONS_OPEN), "Format instructions disappeared")
    expect(rewrite.contains("<transcript>\nhello\n</transcript>"), "Transcript boundary changed")
}

fun main() {
    providerRoutingContracts()
    wireContracts()
    apiUtilityContracts()
    workflowContracts()
    promptContracts()
    println("Android keyboard contract checks passed")
}
