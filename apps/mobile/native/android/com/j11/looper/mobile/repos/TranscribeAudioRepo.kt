package com.j11.looper.mobile.repos

import android.util.Base64
import android.util.Log
import org.json.JSONArray
import org.json.JSONObject
import java.io.File
import java.io.OutputStream
import java.net.HttpURLConnection
import java.net.URL
import java.util.UUID

abstract class BaseTranscribeAudioRepo {
    abstract fun transcribeSync(audioFile: File, prompt: String, language: String): String?
}

class CloudTranscribeAudioRepo(
    private val config: RepoConfig,
) : BaseTranscribeAudioRepo() {
    override fun transcribeSync(audioFile: File, prompt: String, language: String): String? {
        val audio = audioFile.readAudioOrNull(CLOUD_TAG) ?: return null
        val ticket = invokeHandlerRawValueSync(
            config,
            ConvexFunctionKind.MUTATION,
            "upload:generateUploadUrl",
            JSONObject(),
        ) as? String ?: return warn(CLOUD_TAG, "upload:generateUploadUrl returned no URL")

        val storageId = uploadFileSync(ticket, audio, AUDIO_MIME, config.functionUrl)
            ?: return warn(CLOUD_TAG, "audio upload failed")
        val request = JSONObject()
            .put("audioStorageId", storageId)
            .put("provider", "assemblyai")
            .put("model", "universal-3-5-pro")
        language.apiLanguageOrNull()?.let { request.put("language", it) }

        val response = invokeHandlerSync(
            config,
            ConvexFunctionKind.ACTION,
            "stt/transcribe:transcribe",
            request,
        ) ?: return warn(CLOUD_TAG, "stt/transcribe:transcribe failed")
        return (response.opt("text") as? String)
            ?: warn(CLOUD_TAG, "stt/transcribe:transcribe returned no text")
    }
}

class ByokTranscribeAudioRepo(
    private val apiKey: String,
    private val provider: String,
    baseUrl: String?,
    modelOverride: String?,
    private val azureRegion: String?,
) : BaseTranscribeAudioRepo() {
    private val destination = SttDestination.resolve(provider, baseUrl, modelOverride)

    override fun transcribeSync(audioFile: File, prompt: String, language: String): String? =
        when (destination.protocol) {
            SttProtocol.GEMINI_INLINE -> transcribeWithGemini(audioFile, prompt)
            SttProtocol.AZURE_BYTES -> transcribeWithAzure(audioFile, language)
            SttProtocol.WHISPER_MULTIPART -> transcribeWithMultipart(audioFile, prompt, language)
        }

    private fun transcribeWithMultipart(audioFile: File, prompt: String, language: String): String? =
        guarded("BYOK transcribe") {
            val bytes = audioFile.readAudioOrNull(BYOK_TAG) ?: return@guarded null
            val boundary = UUID.randomUUID().toString()
            val connection = (URL(destination.url).openConnection() as HttpURLConnection).apply {
                requestMethod = "POST"
                setRequestProperty("Authorization", "Bearer $apiKey")
                setRequestProperty("Content-Type", "multipart/form-data; boundary=$boundary")
                doOutput = true
            }
            connection.outputStream.buffered().use { output ->
                MultipartAudio(boundary, output)
                    .file(bytes)
                    .field("model", destination.model)
                    .field("response_format", "text")
                    .optionalField("prompt", prompt.takeIf(String::isNotBlank))
                    .optionalField("language", language.apiLanguageOrNull())
                    .finish()
            }
            connection.readSuccessfulBody("BYOK transcribe")
        }

    private fun transcribeWithGemini(audioFile: File, prompt: String): String? =
        guarded("Gemini transcribe") {
            val bytes = audioFile.readAudioOrNull(BYOK_TAG) ?: return@guarded null
            val payload = geminiTranscriptionPayload(bytes, prompt)
            val endpoint = "https://generativelanguage.googleapis.com/v1beta/models/" +
                "${destination.model}:generateContent?key=$apiKey"
            val response = postJsonSync(endpoint, payload) ?: return@guarded null
            if (!response.isSuccess) return@guarded warnHttp("Gemini transcribe", response)
            JSONObject(response.body)
                .optJSONArray("candidates")
                ?.optJSONObject(0)
                ?.optJSONObject("content")
                ?.optJSONArray("parts")
                ?.optJSONObject(0)
                ?.optString("text", "")
                ?.trim()
        }

    private fun transcribeWithAzure(audioFile: File, language: String): String? =
        guarded("Azure STT") {
            val bytes = audioFile.readAudioOrNull(BYOK_TAG) ?: return@guarded null
            val locale = language.apiLanguageOrNull() ?: "en-US"
            val region = azureRegion ?: "eastus"
            val endpoint = "https://$region.stt.speech.microsoft.com/speech/recognition/" +
                "conversation/cognitiveservices/v1?language=$locale&format=detailed"
            val response = postBytesSync(
                endpoint,
                bytes,
                AUDIO_MIME,
                mapOf("Ocp-Apim-Subscription-Key" to apiKey, "Accept" to "application/json"),
            ) ?: return@guarded null
            if (!response.isSuccess) return@guarded warnHttp("Azure STT", response)
            JSONObject(response.body).optString("DisplayText", "").trim()
        }
}

internal enum class SttProtocol { WHISPER_MULTIPART, GEMINI_INLINE, AZURE_BYTES }

internal data class SttDestination(
    val protocol: SttProtocol,
    val url: String,
    val model: String,
) {
    companion object {
        fun resolve(provider: String, baseUrl: String?, override: String?): SttDestination {
            val base = baseUrl.orEmpty().trimEnd('/')
            return when (provider) {
                "groq" -> whisper("https://api.groq.com/openai/v1/audio/transcriptions", override ?: "whisper-large-v3")
                "speaches" -> whisper("$base/v1/audio/transcriptions", override ?: "whisper-large-v3")
                "openaiCompatible" -> whisper("$base/audio/transcriptions", override ?: "whisper-1")
                "ollama" -> whisper(
                    "${(baseUrl ?: "http://localhost:11434").trimEnd('/')}/v1/audio/transcriptions",
                    override ?: "whisper-1",
                )
                "gemini" -> SttDestination(SttProtocol.GEMINI_INLINE, "", override ?: "gemini-2.0-flash")
                "azure" -> SttDestination(SttProtocol.AZURE_BYTES, "", override.orEmpty())
                else -> whisper("https://api.openai.com/v1/audio/transcriptions", override ?: "whisper-1")
            }
        }

        private fun whisper(url: String, model: String) =
            SttDestination(SttProtocol.WHISPER_MULTIPART, url, model)
    }
}

internal class MultipartAudio(
    private val boundary: String,
    private val sink: OutputStream,
) {
    fun file(content: ByteArray): MultipartAudio = apply {
        line("--$boundary")
        line("Content-Disposition: form-data; name=\"file\"; filename=\"audio.m4a\"")
        line("Content-Type: $AUDIO_MIME")
        line("")
        sink.write(content)
        line("")
    }

    fun field(name: String, value: String): MultipartAudio = apply {
        line("--$boundary")
        line("Content-Disposition: form-data; name=\"$name\"")
        line("")
        line(value)
    }

    fun optionalField(name: String, value: String?): MultipartAudio = apply {
        if (value != null) field(name, value)
    }

    fun finish() {
        line("--$boundary--")
    }

    private fun line(value: String) {
        sink.write("$value\r\n".toByteArray())
    }
}

internal fun geminiTranscriptionPayload(audio: ByteArray, prompt: String): JSONObject {
    val instruction = if (prompt.isBlank()) {
        "Transcribe this audio exactly. Output only the transcription text."
    } else {
        "Transcribe this audio exactly. Use these terms if you hear them: $prompt. Output only the transcription text."
    }
    val audioPart = JSONObject().put(
        "inline_data",
        JSONObject()
            .put("mime_type", AUDIO_MIME)
            .put("data", Base64.encodeToString(audio, Base64.NO_WRAP)),
    )
    val parts = JSONArray().put(audioPart).put(JSONObject().put("text", instruction))
    return JSONObject().put("contents", JSONArray().put(JSONObject().put("parts", parts)))
}

private fun File.readAudioOrNull(tag: String): ByteArray? {
    if (!exists() || length() == 0L) {
        Log.w(tag, "No audio data")
        return null
    }
    return readBytes()
}

private fun String.apiLanguageOrNull(): String? =
    takeIf { it.isNotBlank() && it != "auto" }

private val HttpResponse.isSuccess: Boolean
    get() = status in 200..299

private fun HttpURLConnection.readSuccessfulBody(operation: String): String? {
    val code = responseCode
    val source = if (code in 200..299) inputStream else errorStream
    val content = source?.bufferedReader()?.use { it.readText() }.orEmpty()
    disconnect()
    return if (code in 200..299) content.trim() else warn(operation, "HTTP $code ${content.take(200)}")
}

private inline fun guarded(operation: String, action: () -> String?): String? =
    try {
        action()
    } catch (error: Exception) {
        warn(BYOK_TAG, "$operation failed: ${error.message}")
    }

private fun warnHttp(operation: String, response: HttpResponse): String? =
    warn(BYOK_TAG, "$operation: HTTP ${response.status} ${response.body.take(200)}")

private fun warn(tag: String, message: String): String? {
    Log.w(tag, message)
    return null
}

private const val AUDIO_MIME = "audio/mp4"
private const val CLOUD_TAG = "CloudTranscribeRepo"
private const val BYOK_TAG = "ByokTranscribeRepo"
