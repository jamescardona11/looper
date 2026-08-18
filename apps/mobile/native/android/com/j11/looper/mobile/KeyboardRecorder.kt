package com.j11.looper.mobile

import android.media.MediaRecorder
import android.os.Handler
import java.io.File
import kotlin.math.log10
import kotlin.math.max
import kotlin.math.pow

internal class KeyboardRecorder(
    private val handler: Handler,
    private val destination: () -> File,
    private val onLevel: (Float) -> Unit,
    private val onFailure: (String) -> Unit,
) {
    private var recorder: MediaRecorder? = null
    private var meter: Runnable? = null
    private var smoothed = 0f

    fun start(): Boolean {
        smoothed = 0f
        return try {
            destination().deleteIfPresent()
            recorder = MediaRecorder().also { device ->
                device.setAudioSource(MediaRecorder.AudioSource.MIC)
                device.setOutputFormat(MediaRecorder.OutputFormat.MPEG_4)
                device.setAudioEncoder(MediaRecorder.AudioEncoder.AAC)
                device.setAudioSamplingRate(44_100)
                device.setAudioChannels(1)
                device.setOutputFile(destination().absolutePath)
                device.prepare()
                device.start()
            }
            meter = repeatingTask(METER_PERIOD_MS, ::readMeter).also {
                handler.postDelayed(it, METER_PERIOD_MS)
            }
            true
        } catch (error: Exception) {
            onFailure("startAudioCapture: ${error.message}")
            releaseRecorder()
            false
        }
    }

    fun stop() {
        meter?.let(handler::removeCallbacks)
        meter = null
        runCatching { recorder?.stop() }
        releaseRecorder()
    }

    private fun readMeter() {
        val amplitude = runCatching { recorder?.maxAmplitude ?: return }.getOrNull() ?: return
        val decibels = if (amplitude == 0) FLOOR_DB else 20.0 * log10(amplitude.toDouble())
        val normalized = ((max(decibels, FLOOR_DB) - FLOOR_DB) / -FLOOR_DB).toFloat()
        val curved = normalized.pow(.7f)
        val target = curved * .55f
        smoothed += (target - smoothed) * .4f
        onLevel(max(smoothed, .04f))
    }

    private fun releaseRecorder() {
        runCatching { recorder?.release() }
        recorder = null
    }

    private fun repeatingTask(period: Long, action: () -> Unit): Runnable =
        object : Runnable {
            override fun run() {
                action()
                handler.postDelayed(this, period)
            }
        }

    private fun File.deleteIfPresent() {
        if (exists()) delete()
    }

    companion object {
        private const val FLOOR_DB = -50.0
        private const val METER_PERIOD_MS = 30L
    }
}
