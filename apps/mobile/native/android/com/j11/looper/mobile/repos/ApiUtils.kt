package com.j11.looper.mobile.repos

import android.util.Log
import org.json.JSONArray
import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.URI
import java.net.URL

enum class ConvexFunctionKind(val path: String) {
    QUERY("query"),
    MUTATION("mutation"),
    ACTION("action"),
}

data class HttpResponse(
    val status: Int,
    val body: String,
)

fun postJsonSync(
    urlString: String,
    payload: JSONObject,
    authorization: String? = null,
    extraHeaders: Map<String, String> = emptyMap(),
): HttpResponse? = BlockingPost.execute(
    PostRequest(
        destination = urlString,
        content = payload.toString().toByteArray(),
        headers = postHeaders("application/json", authorization, extraHeaders),
    ),
)

fun postBytesSync(
    urlString: String,
    data: ByteArray,
    contentType: String,
    headers: Map<String, String> = emptyMap(),
): HttpResponse? = BlockingPost.execute(
    PostRequest(
        destination = urlString,
        content = data,
        headers = postHeaders(contentType, null, headers),
    ),
)

fun invokeHandlerSync(
    config: RepoConfig,
    kind: ConvexFunctionKind,
    name: String,
    args: JSONObject,
): JSONObject? = invokeConvexSync(config, kind, name, args) as? JSONObject

fun invokeHandlerRawValueSync(
    config: RepoConfig,
    kind: ConvexFunctionKind,
    name: String,
    args: JSONObject,
): Any? = invokeConvexSync(config, kind, name, args)

fun uploadFileSync(
    urlString: String,
    data: ByteArray,
    contentType: String,
    configuredConvexUrl: String? = null,
): String? {
    val destination = UploadDestination.resolve(urlString, configuredConvexUrl)
    val response = postBytesSync(destination, data, contentType) ?: return null
    if (!response.successful) {
        warn("upload failed: HTTP ${response.status} ${response.body.take(LOG_BODY_LIMIT)}")
        return null
    }
    return try {
        val identifier = JSONObject(response.body).opt("storageId") as? String
        if (identifier == null) warn("upload failed: no storageId in response")
        identifier
    } catch (error: Exception) {
        warn("upload failed: ${error.message}")
        null
    }
}

private fun invokeConvexSync(
    config: RepoConfig,
    kind: ConvexFunctionKind,
    name: String,
    args: JSONObject,
): Any? = try {
    val call = ConvexWire.call(config, kind, name, args)
    val response = postJsonSync(call.destination, call.payload, call.authorization) ?: return null
    ConvexWire.readValue(name, response)
} catch (error: Exception) {
    warn("$name failed: ${error.message}")
    null
}

internal data class ConvexCall(
    val destination: String,
    val payload: JSONObject,
    val authorization: String,
)

internal object ConvexWire {
    fun call(
        config: RepoConfig,
        kind: ConvexFunctionKind,
        name: String,
        args: JSONObject,
    ): ConvexCall {
        val envelope = JSONObject()
            .put("path", name)
            .put("format", "convex_encoded_json")
            .put("args", JSONArray().put(args))
        return ConvexCall(
            destination = "${config.functionUrl}/api/${kind.path}",
            payload = envelope,
            authorization = "Bearer ${config.idToken}",
        )
    }

    fun readValue(operation: String, response: HttpResponse): Any? {
        if (!response.successful) {
            warn("$operation failed: HTTP ${response.status} ${response.body.take(LOG_BODY_LIMIT)}")
            return null
        }
        val envelope = JSONObject(response.body)
        if (envelope.optString("status") != "success") {
            val fallback = "$operation failed"
            warn("$operation failed: ${envelope.optString("errorMessage", fallback)}")
            return null
        }
        return envelope.opt("value")
    }
}

internal object UploadDestination {
    fun resolve(uploadUrl: String, configuredConvexUrl: String?): String {
        if (configuredConvexUrl.isNullOrBlank()) return uploadUrl
        return runCatching {
            val upload = URI(uploadUrl)
            val configured = URI(configuredConvexUrl)
            if (!upload.host.isLoopback() || configured.host.isLoopback()) return uploadUrl
            URI(
                configured.scheme,
                upload.userInfo,
                configured.host,
                configured.port,
                upload.path,
                upload.query,
                upload.fragment,
            ).toString()
        }.getOrDefault(uploadUrl)
    }
}

private data class PostRequest(
    val destination: String,
    val content: ByteArray,
    val headers: Map<String, String>,
)

private object BlockingPost {
    fun execute(request: PostRequest): HttpResponse? = try {
        val connection = URL(request.destination).openConnection() as HttpURLConnection
        connection.requestMethod = "POST"
        request.headers.forEach(connection::setRequestProperty)
        connection.doOutput = true
        connection.outputStream.use { stream -> stream.write(request.content) }
        val status = connection.responseCode
        val responseStream = if (status in SUCCESS_RANGE) {
            connection.inputStream
        } else {
            connection.errorStream
        }
        val body = responseStream?.bufferedReader()?.use { it.readText() }.orEmpty()
        connection.disconnect()
        HttpResponse(status, body)
    } catch (error: Exception) {
        warn("HTTP call failed: ${error.message}")
        null
    }
}

private fun postHeaders(
    contentType: String,
    authorization: String?,
    overrides: Map<String, String>,
): Map<String, String> {
    val result = LinkedHashMap<String, String>(overrides.size + 2)
    result["Content-Type"] = contentType
    authorization?.takeIf(String::isNotBlank)?.let { result["Authorization"] = it }
    result.putAll(overrides)
    return result
}

private val HttpResponse.successful: Boolean
    get() = status in SUCCESS_RANGE

private fun String?.isLoopback(): Boolean = when (this?.lowercase()) {
    "localhost", "127.0.0.1", "::1" -> true
    else -> false
}

private fun warn(message: String) {
    Log.w(LOG_TAG, message)
}

private val SUCCESS_RANGE = 200..299
private const val LOG_BODY_LIMIT = 200
private const val LOG_TAG = "LooperRepo"
