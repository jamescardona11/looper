package com.j11.looper.mobile

import android.content.SharedPreferences
import com.j11.looper.mobile.repos.ByokGenerateTextRepo
import com.j11.looper.mobile.repos.ByokTranscribeAudioRepo
import com.j11.looper.mobile.repos.CloudGenerateTextRepo
import com.j11.looper.mobile.repos.CloudTranscribeAudioRepo
import com.j11.looper.mobile.repos.ConvexFunctionKind
import com.j11.looper.mobile.repos.LocalParakeetTranscribeAudioRepo
import com.j11.looper.mobile.repos.RepoConfig
import com.j11.looper.mobile.repos.invokeHandlerSync
import com.j11.looper.mobile.repos.postJsonSync
import org.json.JSONArray
import org.json.JSONObject
import java.io.File
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale
import java.util.TimeZone
import java.util.UUID
import kotlin.math.max
import kotlin.math.min

internal class KeyboardSession(
    private val preferences: SharedPreferences,
    private val log: (String) -> Unit,
) {
    private var token: String? = null
    private var validUntil = 0L

    fun config(): RepoConfig? {
        val functionUrl = preferences.getString(LooperIME.KEY_CONVEX_URL, null)
            ?.takeIf(String::isNotBlank)
            ?: return null
        return idToken()?.let { RepoConfig(functionUrl, it) }
    }

    fun idToken(): String? {
        token?.takeIf { System.currentTimeMillis() < validUntil }?.let {
            log("Using cached ID token")
            return it
        }
        val refresh = preferences.getString(LooperIME.KEY_CONVEX_REFRESH_TOKEN, null)
        val url = preferences.getString(LooperIME.KEY_CONVEX_URL, null)
        val missing = buildList {
            if (refresh == null) add("convexRefreshToken")
            if (url == null) add("convexUrl")
        }
        if (missing.isNotEmpty()) {
            log("Missing keys in SharedPreferences: ${missing.joinToString()}")
            return null
        }
        log("Refreshing Convex session → $url")
        val pair = requestNewSession(url!!, refresh!!) ?: return null
        preferences.edit().putString(LooperIME.KEY_CONVEX_REFRESH_TOKEN, pair.second).apply()
        token = pair.first
        validUntil = (KeyboardPolicy.jwtExpiration(pair.first)
            ?: System.currentTimeMillis() + ONE_HOUR_MS) - REFRESH_MARGIN_MS
        log("ID token acquired")
        return pair.first
    }

    private fun requestNewSession(url: String, refresh: String): Pair<String, String>? =
        runCatching {
            val args = JSONObject().put("refreshToken", refresh)
            val body = JSONObject()
                .put("path", "auth:signIn")
                .put("format", "convex_encoded_json")
                .put("args", JSONArray().put(args))
            val response = postJsonSync("$url/api/action", body)
                ?: return logNull("refreshConvexSession: request failed")
            val envelope = JSONObject(response.body)
            if (envelope.optString("status") != "success") {
                return logNull(
                    "refreshConvexSession: ${envelope.optString("errorMessage", "unexpected response")}",
                )
            }
            val values = envelope.getJSONObject("value").getJSONObject("tokens")
            values.getString("token") to values.getString("refreshToken")
        }.getOrElse { error -> logNull("refreshConvexSession: ${error.message}") }

    private fun <T> logNull(message: String): T? {
        log(message)
        return null
    }

    companion object {
        private const val ONE_HOUR_MS = 3_600_000L
        private const val REFRESH_MARGIN_MS = 60_000L
    }
}

internal object KeyboardRepositoryFactory {
    fun transcription(
        preferences: SharedPreferences,
        config: RepoConfig?,
        mode: String,
    ) = when (mode) {
        "local" -> preferences.getString(LooperIME.KEY_LOCAL_STT_MODEL_PATH, null)
            ?.let(::File)
            ?.let(::LocalParakeetTranscribeAudioRepo)
        "api" -> preferences.getString(LooperIME.KEY_AI_TRANSCRIPTION_API_KEY, null)?.let { key ->
            ByokTranscribeAudioRepo(
                apiKey = key,
                provider = preferences.getString(LooperIME.KEY_AI_TRANSCRIPTION_PROVIDER, "openai") ?: "openai",
                baseUrl = preferences.getString(LooperIME.KEY_AI_TRANSCRIPTION_BASE_URL, null),
                modelOverride = preferences.getString(LooperIME.KEY_AI_TRANSCRIPTION_MODEL, null),
                azureRegion = preferences.getString(LooperIME.KEY_AI_TRANSCRIPTION_AZURE_REGION, null),
            )
        }
        else -> config?.let(::CloudTranscribeAudioRepo)
    }

    fun generation(
        preferences: SharedPreferences,
        config: RepoConfig?,
        mode: String,
    ) = if (mode == "api") {
        preferences.getString(LooperIME.KEY_AI_POST_PROCESSING_API_KEY, null)?.let { key ->
            ByokGenerateTextRepo(
                apiKey = key,
                provider = preferences.getString(LooperIME.KEY_AI_POST_PROCESSING_PROVIDER, "openai") ?: "openai",
                baseUrl = preferences.getString(LooperIME.KEY_AI_POST_PROCESSING_BASE_URL, null),
                modelOverride = preferences.getString(LooperIME.KEY_AI_POST_PROCESSING_MODEL, null),
            )
        }
    } else {
        config?.let(::CloudGenerateTextRepo)
    }

    fun member(config: RepoConfig, log: (String) -> Unit): KeyboardMember? = runCatching {
        val row = invokeHandlerSync(
            config,
            ConvexFunctionKind.QUERY,
            "payments/subscription:mySubscription",
            JSONObject(),
        ) ?: return null
        val trial = row.optString("status", "none") == "trialing"
        KeyboardMember(
            plan = row.optString("tier", "free"),
            trial = trial,
            trialEnd = if (trial && row.has("expiresAt") && !row.isNull("expiresAt")) {
                SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss'Z'", Locale.US).apply {
                    timeZone = TimeZone.getTimeZone("UTC")
                }.format(Date(row.optLong("expiresAt")))
            } else {
                null
            },
        )
    }.getOrElse { error ->
        log("getMyMember failed: ${error.message}")
        null
    }
}

internal class KeyboardHistory(
    private val preferences: SharedPreferences,
    private val filesDirectory: File,
    private val sourceAudio: () -> File,
    private val log: (String) -> Unit,
) {
    fun prepend(text: String, raw: String, toneId: String?, toneName: String?) {
        val identifier = UUID.randomUUID().toString()
        val record = JSONObject()
            .put("id", identifier)
            .put("text", text)
            .put("rawTranscript", raw)
            .put("createdAt", KeyboardPolicy.timestampNow())
        toneId?.takeIf(String::isNotBlank)?.let { record.put("toneId", it) }
        toneName?.takeIf(String::isNotBlank)?.let { record.put("toneName", it) }
        retainAudio(identifier)?.let { record.put("audioPath", it.absolutePath) }

        val settings = KeyboardSettings(preferences)
        val previous = settings.history()
        val combined = JSONArray().put(record)
        val retainedOld = max(0, LooperIME.MAX_TRANSCRIPTION_ENTRIES - 1)
        repeat(min(previous.length(), retainedOld)) { combined.put(previous.opt(it)) }
        for (index in retainedOld until previous.length()) {
            previous.optJSONObject(index)?.optString("audioPath")
                ?.takeIf(String::isNotBlank)
                ?.let(::File)
                ?.delete()
        }
        settings.replaceHistory(combined)
    }

    private fun retainAudio(identifier: String): File? {
        val source = sourceAudio()
        if (!source.isFile || source.length() == 0L) return null
        val directory = File(filesDirectory, "keyboard_audio")
        if (!directory.exists()) directory.mkdirs()
        val destination = File(directory, "$identifier.m4a")
        return runCatching { source.copyTo(destination, overwrite = true) }
            .onFailure { log("Failed to copy audio: ${it.message}") }
            .getOrNull()
    }
}
