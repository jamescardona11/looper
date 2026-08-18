package com.j11.looper.mobile

import android.content.Context
import android.content.Intent
import android.provider.Settings
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.bridge.ReadableArray
import com.facebook.react.bridge.ReadableMap
import org.json.JSONArray
import org.json.JSONObject

/** Writes React Native configuration into the preferences consumed by LooperIME. */
class LooperKeyboardModule(
    private val reactContext: ReactApplicationContext,
) : ReactContextBaseJavaModule(reactContext) {

    override fun getName() = "LooperKeyboard"

    @ReactMethod
    fun sync(payload: ReadableMap, promise: Promise) {
        try {
            val convexUrl = payload.optionalString("convexUrl")
            if (convexUrl.isNullOrBlank()) {
                promise.reject("INVALID_CONFIG", "convexUrl is required")
                return
            }

            val preferences = reactContext.getSharedPreferences(LooperIME.PREFS_NAME, Context.MODE_PRIVATE)
            val editor = preferences.edit()
                .putString(LooperIME.KEY_CONVEX_URL, convexUrl)
                .putString(
                    LooperIME.KEY_TERM_IDS,
                    payload.getArray("termIds")?.toJsonArray()?.toString() ?: JSONArray().toString(),
                )
                .putString(
                    LooperIME.KEY_TERM_BY_ID,
                    payload.getMap("termById")?.toJsonObject()?.toString() ?: JSONObject().toString(),
                )
                .putString(
                    LooperIME.KEY_SNIPPETS,
                    payload.getArray("snippets")?.toJsonArray()?.toString() ?: JSONArray().toString(),
                )
                .putString(
                    LooperIME.KEY_ACTIVE_TONE_IDS,
                    payload.getArray("activeToneIds")?.toJsonArray()?.toString() ?: JSONArray().toString(),
                )
                .putString(
                    LooperIME.KEY_TONE_BY_ID,
                    payload.getMap("toneById")?.toJsonObject()?.toString() ?: JSONObject().toString(),
                )
                .putString(
                    LooperIME.KEY_SMART_MODE_RULES,
                    payload.getArray("smartModeRules")?.toJsonArray()?.toString() ?: JSONArray().toString(),
                )
                .putString(
                    LooperIME.KEY_LOCAL_STT_MODEL_PATH,
                    payload.optionalString("localSttModelPath"),
                )
                .putString(
                    LooperIME.KEY_AI_TRANSCRIPTION_MODE,
                    payload.optionalString("transcriptionMode") ?: "cloud",
                )
                .putInt(
                    LooperIME.KEY_KEYBOARD_UPDATE_COUNTER,
                    preferences.getInt(LooperIME.KEY_KEYBOARD_UPDATE_COUNTER, 0) + 1,
                )

            payload.optionalString("refreshToken")
                ?.takeIf(String::isNotBlank)
                ?.let { editor.putString(LooperIME.KEY_CONVEX_REFRESH_TOKEN, it) }
                ?: editor.remove(LooperIME.KEY_CONVEX_REFRESH_TOKEN)

            payload.optionalString("selectedToneId")
                ?.takeIf(String::isNotBlank)
                ?.let { editor.putString(LooperIME.KEY_SELECTED_TONE_ID, it) }
                ?: editor.remove(LooperIME.KEY_SELECTED_TONE_ID)

            editor.apply()
            promise.resolve(null)
        } catch (error: Exception) {
            promise.reject("KEYBOARD_SYNC_FAILED", error.message, error)
        }
    }

    @ReactMethod
    fun openSettings(promise: Promise) {
        try {
            reactContext.startActivity(
                Intent(Settings.ACTION_INPUT_METHOD_SETTINGS).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK),
            )
            promise.resolve(null)
        } catch (error: Exception) {
            promise.reject("KEYBOARD_SETTINGS_FAILED", error.message, error)
        }
    }

    @ReactMethod
    fun isEnabled(promise: Promise) {
        val selectedInputMethod = Settings.Secure.getString(
            reactContext.contentResolver,
            Settings.Secure.DEFAULT_INPUT_METHOD,
        )
        promise.resolve(selectedInputMethod?.contains(".LooperIME") == true)
    }
}

private fun ReadableMap.optionalString(key: String): String? {
    return if (hasKey(key) && !isNull(key)) getString(key) else null
}

private fun ReadableArray.toJsonArray(): JSONArray = JSONArray(toArrayList())

private fun ReadableMap.toJsonObject(): JSONObject = JSONObject(toHashMap())
