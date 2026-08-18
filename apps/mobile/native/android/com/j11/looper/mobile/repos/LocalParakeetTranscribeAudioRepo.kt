package com.j11.looper.mobile.repos

import android.media.MediaCodec
import android.media.MediaExtractor
import android.media.MediaFormat
import android.util.Log
import com.k2fsa.sherpa.onnx.FeatureConfig
import com.k2fsa.sherpa.onnx.OfflineModelConfig
import com.k2fsa.sherpa.onnx.OfflineRecognizer
import com.k2fsa.sherpa.onnx.OfflineRecognizerConfig
import com.k2fsa.sherpa.onnx.OfflineTransducerModelConfig
import java.io.ByteArrayOutputStream
import java.io.File
import java.nio.ByteBuffer
import java.nio.ByteOrder
import kotlin.math.floor

/**
 * Runs the Parakeet bundle downloaded by the React Native app from the Android IME process.
 * The IME and host app share one UID, so the synced private model path remains readable.
 */
class LocalParakeetTranscribeAudioRepo(
    private val modelDirectory: File,
) : BaseTranscribeAudioRepo() {

    override fun transcribeSync(audioFile: File, prompt: String, language: String): String? {
        if (!hasModelFiles()) {
            Log.w(TAG, "Parakeet model is unavailable at ${modelDirectory.absolutePath}")
            return null
        }

        val samples = decodeToMono16k(audioFile) ?: return null
        return try {
            ensureNativeLibrariesLoaded()
            // The model lives in the app's private storage, not in APK assets.
            val recognizer = OfflineRecognizer(null, buildRecognizerConfig())
            try {
                val stream = recognizer.createStream()
                try {
                    stream.acceptWaveform(samples, TARGET_SAMPLE_RATE)
                    recognizer.decode(stream)
                    recognizer.getResult(stream).text.trim().takeIf(String::isNotEmpty)
                } finally {
                    stream.release()
                }
            } finally {
                recognizer.release()
            }
        } catch (error: Throwable) {
            Log.w(TAG, "Local Parakeet transcription failed", error)
            null
        }
    }

    private fun buildRecognizerConfig(): OfflineRecognizerConfig {
        val modelConfig = OfflineModelConfig(
            transducer = OfflineTransducerModelConfig(
                encoder = modelFile("encoder.int8.onnx").absolutePath,
                decoder = modelFile("decoder.int8.onnx").absolutePath,
                joiner = modelFile("joiner.int8.onnx").absolutePath,
            ),
            tokens = modelFile("tokens.txt").absolutePath,
            numThreads = 2,
            provider = "cpu",
            modelType = "nemo_transducer",
        )
        return OfflineRecognizerConfig(
            featConfig = FeatureConfig(sampleRate = TARGET_SAMPLE_RATE, featureDim = 80, dither = 0f),
            modelConfig = modelConfig,
        )
    }

    private fun hasModelFiles(): Boolean = REQUIRED_MODEL_FILES.all { modelFile(it).isFile }

    private fun modelFile(name: String) = File(modelDirectory, name)

    private fun decodeToMono16k(file: File): FloatArray? {
        val extractor = MediaExtractor()
        return try {
            extractor.setDataSource(file.absolutePath)
            val trackIndex = (0 until extractor.trackCount).firstOrNull {
                extractor.getTrackFormat(it).getString(MediaFormat.KEY_MIME)?.startsWith("audio/") == true
            } ?: return null
            extractor.selectTrack(trackIndex)
            val format = extractor.getTrackFormat(trackIndex)
            val mime = format.getString(MediaFormat.KEY_MIME) ?: return null
            val codec = MediaCodec.createDecoderByType(mime)
            codec.configure(format, null, null, 0)
            codec.start()
            try {
                decodePcm(codec, extractor)
            } finally {
                codec.stop()
                codec.release()
            }
        } catch (error: Exception) {
            Log.w(TAG, "Could not decode keyboard recording", error)
            null
        } finally {
            extractor.release()
        }
    }

    private fun decodePcm(codec: MediaCodec, extractor: MediaExtractor): FloatArray? {
        val output = ByteArrayOutputStream()
        val info = MediaCodec.BufferInfo()
        var inputEnded = false
        var outputEnded = false
        var sampleRate = 0
        var channels = 1

        while (!outputEnded) {
            if (!inputEnded) {
                val inputIndex = codec.dequeueInputBuffer(TIMEOUT_US)
                if (inputIndex >= 0) {
                    val buffer = codec.getInputBuffer(inputIndex) ?: continue
                    val size = extractor.readSampleData(buffer, 0)
                    if (size < 0) {
                        codec.queueInputBuffer(inputIndex, 0, 0, 0, MediaCodec.BUFFER_FLAG_END_OF_STREAM)
                        inputEnded = true
                    } else {
                        codec.queueInputBuffer(inputIndex, 0, size, extractor.sampleTime, 0)
                        extractor.advance()
                    }
                }
            }

            when (val outputIndex = codec.dequeueOutputBuffer(info, TIMEOUT_US)) {
                MediaCodec.INFO_OUTPUT_FORMAT_CHANGED -> {
                    sampleRate = codec.outputFormat.getInteger(MediaFormat.KEY_SAMPLE_RATE)
                    channels = codec.outputFormat.getInteger(MediaFormat.KEY_CHANNEL_COUNT)
                }
                else -> if (outputIndex >= 0) {
                    codec.getOutputBuffer(outputIndex)?.let { buffer ->
                        buffer.position(info.offset)
                        buffer.limit(info.offset + info.size)
                        ByteArray(info.size).also(buffer::get).also(output::write)
                    }
                    outputEnded = info.flags and MediaCodec.BUFFER_FLAG_END_OF_STREAM != 0
                    codec.releaseOutputBuffer(outputIndex, false)
                }
            }
        }

        if (sampleRate <= 0 || output.size() == 0) return null
        return pcm16ToMono16k(output.toByteArray(), channels, sampleRate)
    }

    private fun pcm16ToMono16k(input: ByteArray, channels: Int, sourceRate: Int): FloatArray {
        val shorts = ByteBuffer.wrap(input).order(ByteOrder.LITTLE_ENDIAN).asShortBuffer()
        val frameCount = shorts.remaining() / channels
        val mono = FloatArray(frameCount)
        for (frame in 0 until frameCount) {
            var sum = 0
            repeat(channels) { sum += shorts.get().toInt() }
            mono[frame] = sum.toFloat() / channels / Short.MAX_VALUE
        }
        if (sourceRate == TARGET_SAMPLE_RATE) return mono

        val outputCount = floor(frameCount.toDouble() * TARGET_SAMPLE_RATE / sourceRate).toInt()
        return FloatArray(outputCount) { index ->
            val source = index.toDouble() * sourceRate / TARGET_SAMPLE_RATE
            val left = floor(source).toInt().coerceAtMost(frameCount - 1)
            val right = (left + 1).coerceAtMost(frameCount - 1)
            val fraction = (source - left).toFloat()
            mono[left] + (mono[right] - mono[left]) * fraction
        }
    }

    private fun ensureNativeLibrariesLoaded() {
        if (nativeLibrariesLoaded) return
        synchronized(this) {
            if (nativeLibrariesLoaded) return
            System.loadLibrary("onnxruntime")
            System.loadLibrary("sherpa-onnx-jni")
            nativeLibrariesLoaded = true
        }
    }

    companion object {
        private const val TAG = "LocalParakeetRepo"
        private const val TARGET_SAMPLE_RATE = 16_000
        private const val TIMEOUT_US = 10_000L
        private val REQUIRED_MODEL_FILES = listOf(
            "encoder.int8.onnx",
            "decoder.int8.onnx",
            "joiner.int8.onnx",
            "tokens.txt",
        )

        @Volatile
        private var nativeLibrariesLoaded = false
    }
}
