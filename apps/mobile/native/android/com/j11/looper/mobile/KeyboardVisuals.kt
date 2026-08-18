package com.j11.looper.mobile

import android.content.Context
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.LinearGradient
import android.graphics.Paint
import android.graphics.PorterDuff
import android.graphics.PorterDuffXfermode
import android.graphics.Shader
import android.view.Choreographer
import android.view.View
import kotlin.math.abs
import kotlin.math.max
import kotlin.math.min
import kotlin.math.sin

open class KeyboardWaveform(context: Context) : View(context) {
    private data class Layer(
        val cycles: Float,
        val scale: Float,
        val phase: Float,
        val alpha: Float,
    )

    private val layers = arrayOf(
        Layer(cycles = .8f, scale = 1f, phase = 0f, alpha = 1f),
        Layer(cycles = 1f, scale = .8f, phase = .85f, alpha = .65f),
        Layer(cycles = 1.25f, scale = .6f, phase = 1.7f, alpha = .35f),
    )
    private val stroke = Paint(Paint.ANTI_ALIAS_FLAG).also {
        it.style = Paint.Style.STROKE
        it.strokeWidth = 2.5f * resources.displayMetrics.density
        it.strokeCap = Paint.Cap.ROUND
        it.strokeJoin = Paint.Join.ROUND
    }
    private val mask = Paint().also {
        it.xfermode = PorterDuffXfermode(PorterDuff.Mode.DST_IN)
    }
    private var animation: Choreographer.FrameCallback? = null
    private var angle = 0f
    private var visibleLevel = 0f
    private var requestedLevel = 0f

    var color: Int = Color.BLACK
        set(value) {
            field = value
            invalidate()
        }

    var listening: Boolean = false
        set(value) {
            field = value
            if (!value) requestedLevel = 0f
        }

    fun update(level: Float) {
        requestedLevel = level
    }

    fun begin() {
        end()
        val frames = object : Choreographer.FrameCallback {
            override fun doFrame(frameTimeNanos: Long) {
                advance()
                Choreographer.getInstance().postFrameCallback(this)
            }
        }
        animation = frames
        Choreographer.getInstance().postFrameCallback(frames)
    }

    fun end() {
        animation?.let(Choreographer.getInstance()::removeFrameCallback)
        animation = null
    }

    private fun advance() {
        val blend = if (requestedLevel > visibleLevel) .3f else .12f
        visibleLevel += (requestedLevel - visibleLevel) * blend
        if (listening) angle += .18f + visibleLevel * .06f
        angle %= TWO_PI
        invalidate()
    }

    override fun onDraw(canvas: Canvas) {
        val surface = canvas.saveLayer(0f, 0f, width.toFloat(), height.toFloat(), null)
        stroke.color = color
        if (!listening && visibleLevel < .01f) {
            stroke.alpha = 255
            canvas.drawLine(0f, height / 2f, width.toFloat(), height / 2f, stroke)
        } else {
            layers.forEach { drawLayer(canvas, it) }
        }
        mask.shader = LinearGradient(
            0f,
            0f,
            width.toFloat(),
            0f,
            intArrayOf(Color.TRANSPARENT, Color.WHITE, Color.WHITE, Color.TRANSPARENT),
            floatArrayOf(0f, .12f, .88f, 1f),
            Shader.TileMode.CLAMP,
        )
        canvas.drawRect(0f, 0f, width.toFloat(), height.toFloat(), mask)
        canvas.restoreToCount(surface)
    }

    private fun drawLayer(canvas: Canvas, layer: Layer) {
        stroke.alpha = (layer.alpha * 255).toInt()
        val amplitude = height * .22f * visibleLevel * layer.scale
        var previousX = 0f
        var previousY = yAt(0f, amplitude, layer)
        for (sample in 1..SAMPLES) {
            val x = sample.toFloat() / SAMPLES * width
            val y = yAt(x / width, amplitude, layer)
            canvas.drawLine(previousX, previousY, x, y, stroke)
            previousX = x
            previousY = y
        }
    }

    private fun yAt(position: Float, amplitude: Float, layer: Layer): Float =
        height / 2f + amplitude * sin(layer.cycles * position * TWO_PI + angle + layer.phase)

    companion object {
        private const val SAMPLES = 60
        private const val TWO_PI = (Math.PI * 2).toFloat()
    }
}

open class KeyboardProgress(context: Context) : View(context) {
    private val dot = Paint(Paint.ANTI_ALIAS_FLAG).also { it.style = Paint.Style.FILL }
    private var elapsed = 0f
    private var animation: Choreographer.FrameCallback? = null

    var color: Int = Color.BLACK

    fun begin() {
        end()
        elapsed = 0f
        val frames = object : Choreographer.FrameCallback {
            override fun doFrame(frameTimeNanos: Long) {
                elapsed = (elapsed + 1f / 60f) % CYCLE_SECONDS
                invalidate()
                Choreographer.getInstance().postFrameCallback(this)
            }
        }
        animation = frames
        Choreographer.getInstance().postFrameCallback(frames)
    }

    fun end() {
        animation?.let(Choreographer.getInstance()::removeFrameCallback)
        animation = null
    }

    override fun onDraw(canvas: Canvas) {
        val stride = width.toFloat() / DOTS
        val focus = elapsed / CYCLE_SECONDS * DOTS
        dot.color = color
        repeat(DOTS) { index ->
            val linearDistance = abs(index - focus)
            val distance = min(linearDistance, DOTS - linearDistance)
            val intensity = max(.22f, 1f - distance * .45f)
            dot.alpha = (255 * intensity).toInt()
            val radius = (2.1f + 1.2f * intensity) * resources.displayMetrics.density
            canvas.drawCircle(stride * (index + .5f), height / 2f, radius, dot)
        }
    }

    companion object {
        private const val DOTS = 8
        private const val CYCLE_SECONDS = 1.8f
    }
}
