package com.j11.looper.mobile

import android.Manifest
import android.animation.Animator
import android.animation.AnimatorListenerAdapter
import android.animation.ValueAnimator
import android.content.ClipData
import android.content.ClipboardManager
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.content.res.ColorStateList
import android.content.res.Configuration
import android.graphics.Color
import android.graphics.drawable.GradientDrawable
import android.inputmethodservice.InputMethodService
import android.os.Build
import android.os.Handler
import android.os.Looper
import android.text.InputType
import android.util.Log
import android.view.Gravity
import android.view.KeyEvent
import android.view.MotionEvent
import android.view.View
import android.view.animation.DecelerateInterpolator
import android.view.inputmethod.EditorInfo
import android.view.inputmethod.ExtractedTextRequest
import android.widget.FrameLayout
import android.widget.HorizontalScrollView
import android.widget.ImageButton
import android.widget.ImageView
import android.widget.LinearLayout
import android.widget.ProgressBar
import android.widget.TextView
import com.j11.looper.mobile.repos.RepoConfig
import org.json.JSONObject
import java.io.File
import java.util.Locale
import java.util.concurrent.Executors
import kotlin.math.max

class LooperIME : InputMethodService() {
    enum class Phase { IDLE, RECORDING, LOADING, ERROR }

    private lateinit var background: FrameLayout
    private lateinit var waveformHost: FrameLayout
    private lateinit var dictateButton: FrameLayout
    private lateinit var dictateIcon: ImageView
    private lateinit var dictateSpinner: ProgressBar
    private lateinit var dictateLabel: TextView
    private lateinit var statusRow: LinearLayout
    private lateinit var statusLabel: TextView
    private lateinit var statusDot: TextView
    private lateinit var upgradeButton: TextView
    private lateinit var logoButton: ImageButton
    private lateinit var languageButton: TextView
    private lateinit var atButton: ImageButton
    private lateinit var spaceButton: ImageButton
    private lateinit var returnButton: ImageButton
    private lateinit var deleteButton: ImageButton
    private lateinit var toneScroller: HorizontalScrollView
    private lateinit var toneRow: LinearLayout
    private lateinit var formatScroller: HorizontalScrollView
    private lateinit var formatRow: LinearLayout

    private var waveform: KeyboardWaveform? = null
    private var progress: KeyboardProgress? = null
    private val mainHandler = Handler(Looper.getMainLooper())
    private val worker = Executors.newSingleThreadExecutor()

    private var phase = Phase.IDLE
    private var errorCopy = ""
    private var debugCopy = ""
    private var nightMode = Configuration.UI_MODE_NIGHT_UNDEFINED
    private var originalHeight = 0
    private var originalBottomPadding = 0

    private var selectedToneId: String? = null
    private var selectedFormatId: String? = null
    private var selectedWorkflowId: String? = null
    private var activeToneIds: List<String> = emptyList()
    private var toneById: Map<String, KeyboardTone> = emptyMap()
    private var smartModeRules: List<KeyboardWorkflow> = emptyList()
    private var manualSmartModeRules: List<KeyboardWorkflow> = emptyList()
    private var dictationLanguages = listOf("en")
    private var member: KeyboardMember? = null

    private var keyboardCounter = -1
    private var keyboardCounterTask: Runnable? = null
    private var memberTask: Runnable? = null
    private var statusAnimation: ValueAnimator? = null
    private var statusVisible = false
    private var deleteTask: Runnable? = null
    private var wordDeleteTask: Runnable? = null
    private var deletingWords = false

    private lateinit var session: KeyboardSession
    private val preferences by lazy { getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE) }
    private val audioFile by lazy { File(cacheDir, "looper_kb.m4a") }
    private val recorder by lazy {
        KeyboardRecorder(
            handler = mainHandler,
            destination = { audioFile },
            onLevel = { waveform?.update(it) },
            onFailure = ::debug,
        )
    }
    private val history by lazy {
        KeyboardHistory(preferences, filesDir, { audioFile }, ::debug)
    }

    override fun onCreate() {
        super.onCreate()
        session = KeyboardSession(preferences, ::debug)
        rememberNightMode(resources.configuration)
    }

    override fun onCreateInputView(): View {
        val root = layoutInflater.inflate(R.layout.keyboard_view, null)
        bindViews(root)
        installSignalViews()
        installInteractions()
        applySafeArea(root, root.findViewById(R.id.keyboard_content))
        window.window?.decorView?.setBackgroundColor(Color.TRANSPARENT)
        window.window?.navigationBarColor = Color.TRANSPARENT

        waveform?.begin()
        rememberNightMode(resources.configuration)
        reloadKeyboardConfig()
        startConfigPolling()
        startMemberPolling()
        refreshMember()
        setPhase(Phase.IDLE)
        return root
    }

    private fun bindViews(root: View) {
        val content = root.findViewById<FrameLayout>(R.id.keyboard_content)
        background = root.findViewById(R.id.keyboard_background)
        waveformHost = root.findViewById(R.id.waveform_container)
        dictateButton = root.findViewById(R.id.pill_button)
        dictateIcon = root.findViewById(R.id.pill_icon)
        dictateSpinner = root.findViewById(R.id.pill_activity)
        dictateLabel = root.findViewById(R.id.pill_label)
        statusRow = root.findViewById(R.id.status_row)
        statusLabel = root.findViewById(R.id.status_label)
        statusDot = root.findViewById(R.id.status_dot)
        upgradeButton = root.findViewById(R.id.upgrade_button)
        logoButton = root.findViewById(R.id.logo_button)
        languageButton = root.findViewById(R.id.language_chip)
        atButton = root.findViewById(R.id.util_at_button)
        spaceButton = root.findViewById(R.id.util_space_button)
        returnButton = root.findViewById(R.id.util_return_button)
        deleteButton = root.findViewById(R.id.util_delete_button)
        toneScroller = root.findViewById(R.id.tone_scroll)
        toneRow = root.findViewById(R.id.tone_chip_row)
        formatScroller = root.findViewById(R.id.format_scroll)
        formatRow = root.findViewById(R.id.format_chip_row)
        statusRow.alpha = 0f
        originalHeight = content.layoutParams.height
        originalBottomPadding = content.paddingBottom
        configureScroller(toneScroller)
        configureScroller(formatScroller)
    }

    private fun configureScroller(scroller: HorizontalScrollView) {
        scroller.isHorizontalFadingEdgeEnabled = true
        scroller.isVerticalFadingEdgeEnabled = false
        scroller.setFadingEdgeLength(dp(18f).toInt())
    }

    private fun installSignalViews() {
        waveform = KeyboardWaveform(this).also { signal ->
            waveformHost.addView(signal, fillParent())
        }
        progress = KeyboardProgress(this).also { indicator ->
            indicator.alpha = 0f
            waveformHost.addView(
                indicator,
                FrameLayout.LayoutParams(
                    FrameLayout.LayoutParams.MATCH_PARENT,
                    dp(20f).toInt(),
                    Gravity.CENTER_VERTICAL,
                ),
            )
        }
    }

    private fun fillParent() = FrameLayout.LayoutParams(
        FrameLayout.LayoutParams.MATCH_PARENT,
        FrameLayout.LayoutParams.MATCH_PARENT,
    )

    private fun installInteractions() {
        dictateButton.setOnTouchListener(scaleFeedback(.96f))
        dictateButton.setOnClickListener { handleDictateTap() }
        listOf<View>(
            logoButton,
            languageButton,
            atButton,
            spaceButton,
            returnButton,
            deleteButton,
            upgradeButton,
        ).forEach { it.setOnTouchListener(scaleFeedback(.9f)) }
        logoButton.setOnClickListener { openLooper() }
        languageButton.setOnClickListener { cycleLanguage() }
        atButton.setOnClickListener { currentInputConnection?.commitText("@", 1) }
        spaceButton.setOnClickListener { currentInputConnection?.commitText(" ", 1) }
        returnButton.setOnClickListener { sendReturn() }
        deleteButton.setOnTouchListener { view, event -> handleDeleteTouch(view, event) }
        upgradeButton.setOnClickListener { openLooper(showPaywall = true) }
    }

    private fun scaleFeedback(pressedScale: Float): View.OnTouchListener =
        View.OnTouchListener { target, event ->
            when (event.actionMasked) {
                MotionEvent.ACTION_DOWN -> target.animate()
                    .scaleX(pressedScale)
                    .scaleY(pressedScale)
                    .setDuration(100)
                    .start()
                MotionEvent.ACTION_UP, MotionEvent.ACTION_CANCEL -> target.animate()
                    .scaleX(1f)
                    .scaleY(1f)
                    .setDuration(150)
                    .start()
            }
            false
        }

    override fun onStartInputView(info: EditorInfo?, restarting: Boolean) {
        super.onStartInputView(info, restarting)
        refreshTheme(resources.configuration)
    }

    override fun onWindowShown() {
        super.onWindowShown()
        refreshTheme(resources.configuration)
    }

    override fun onConfigurationChanged(newConfig: Configuration) {
        super.onConfigurationChanged(newConfig)
        refreshTheme(newConfig)
    }

    private fun refreshTheme(configuration: Configuration) {
        rememberNightMode(configuration)
        if (::background.isInitialized) setPhase(phase)
    }

    private fun rememberNightMode(configuration: Configuration) {
        nightMode = configuration.uiMode and Configuration.UI_MODE_NIGHT_MASK
    }

    private val darkTheme: Boolean
        get() = nightMode == Configuration.UI_MODE_NIGHT_YES

    private fun setPhase(next: Phase) {
        phase = next
        val primary = if (darkTheme) Color.WHITE else Color.rgb(28, 28, 30)
        val onPrimary = if (darkTheme) Color.rgb(20, 21, 25) else Color.WHITE
        val inactive = if (darkTheme) COLOR_GRAY_DARK else COLOR_GRAY_LIGHT
        val pill = (dictateButton.background as? GradientDrawable)
            ?: (dictateButton.background?.mutate() as? GradientDrawable)
        applyThemeColors()

        when (next) {
            Phase.IDLE -> {
                showWaveform(false, primary)
                showProgress(false, primary)
                pill?.setColor(primary)
                configurePill("Dictate", R.drawable.ic_mic, true, "Start dictation", onPrimary)
            }
            Phase.RECORDING -> {
                showWaveform(true, primary)
                showProgress(false, primary)
                pill?.setColor(primary)
                configurePill(
                    "Listening",
                    R.drawable.ic_stop,
                    true,
                    "Stop dictation. Listening",
                    onPrimary,
                )
            }
            Phase.LOADING -> {
                showWaveform(false, primary)
                showProgress(true, primary)
                pill?.setColor(inactive)
                dictateLabel.text = "Processing"
                dictateLabel.alpha = 1f
                dictateIcon.visibility = View.GONE
                dictateSpinner.visibility = View.VISIBLE
                dictateButton.isClickable = false
                dictateButton.isEnabled = false
                dictateButton.contentDescription = "Dictation processing"
                dictateSpinner.indeterminateTintList = ColorStateList.valueOf(onPrimary)
            }
            Phase.ERROR -> {
                showWaveform(false, primary)
                showProgress(false, primary)
                pill?.setColor(Color.rgb(0xff, 0x3b, 0x30))
                configurePill(
                    errorCopy,
                    R.drawable.ic_mic,
                    true,
                    "Dictation error. $errorCopy",
                    onPrimary,
                )
            }
        }
    }

    private fun applyThemeColors() {
        background.setBackgroundResource(R.drawable.keyboard_background)
        val foreground = if (darkTheme) Color.WHITE else Color.BLACK
        val secondary = if (darkTheme) {
            Color.argb(191, 235, 235, 245)
        } else {
            Color.argb(153, 60, 60, 67)
        }
        val tertiary = if (darkTheme) {
            Color.argb(128, 235, 235, 245)
        } else {
            Color.argb(77, 60, 60, 67)
        }
        val utility = if (darkTheme) COLOR_UTILITY_DARK else COLOR_UTILITY_LIGHT
        listOf(logoButton, atButton, spaceButton, returnButton, deleteButton)
            .forEach { it.setColorFilter(foreground) }
        languageButton.setTextColor(foreground)
        statusLabel.setTextColor(secondary)
        statusDot.setTextColor(tertiary)
        upgradeButton.setTextColor(COLOR_ACCENT)
        listOf<View>(logoButton, languageButton, atButton, spaceButton, returnButton, deleteButton)
            .forEach { setRoundedFill(it, utility, 8f) }
        renderToneChips()
        renderFormatChips()
        updateStatusBanner()
    }

    private fun configurePill(
        text: String,
        icon: Int,
        enabled: Boolean,
        description: String,
        foreground: Int,
    ) {
        dictateLabel.text = text
        dictateLabel.alpha = 1f
        dictateIcon.setImageResource(icon)
        dictateIcon.setColorFilter(foreground)
        dictateIcon.visibility = View.VISIBLE
        dictateSpinner.visibility = View.GONE
        dictateButton.isClickable = enabled
        dictateButton.isEnabled = enabled
        dictateButton.contentDescription = description
    }

    private fun showWaveform(visible: Boolean, color: Int) {
        waveform?.alpha = if (visible) 1f else 0f
        waveform?.listening = visible
        waveform?.color = color
    }

    private fun showProgress(visible: Boolean, color: Int) {
        progress?.alpha = if (visible) 1f else 0f
        progress?.color = color
        if (visible) progress?.begin() else progress?.end()
    }

    private fun showError(message: String) {
        errorCopy = message
        setPhase(Phase.ERROR)
        mainHandler.postDelayed({
            if (phase == Phase.ERROR) setPhase(Phase.IDLE)
        }, ERROR_DURATION_MS)
    }

    private fun handleDictateTap() {
        when (phase) {
            Phase.IDLE -> beginDictation()
            Phase.RECORDING -> finishDictation()
            Phase.LOADING -> Unit
            Phase.ERROR -> setPhase(Phase.IDLE)
        }
    }

    private fun beginDictation() {
        if (checkSelfPermission(Manifest.permission.RECORD_AUDIO) != PackageManager.PERMISSION_GRANTED) {
            showError("Mic permission needed — open Looper")
            return
        }
        if (!recorder.start()) {
            showError("Microphone error — try again")
            return
        }
        setPhase(Phase.RECORDING)
    }

    private fun finishDictation() {
        recorder.stop()
        setPhase(Phase.LOADING)
        transcribeRecording()
    }

    private fun reloadKeyboardConfig() {
        val state = KeyboardSettings(preferences).snapshot(KEYBOARD_FORMATS)
        dictationLanguages = state.languages
        activeToneIds = state.activeToneIds
        toneById = state.tones
        smartModeRules = state.rules
        manualSmartModeRules = state.manualRules
        selectedToneId = state.selectedToneId
        selectedFormatId = state.selectedFormatId
        selectedWorkflowId = state.selectedWorkflowId
        renderLanguage()
        renderToneChips()
        renderFormatChips()
        updateStatusBanner()
    }

    private fun renderLanguage() {
        val language = KeyboardSettings(preferences).language(dictationLanguages)
        languageButton.text = language.substringBefore('-').uppercase(Locale.US)
        languageButton.visibility = if (dictationLanguages.size > 1) View.VISIBLE else View.GONE
    }

    private fun cycleLanguage() {
        if (dictationLanguages.size < 2) return
        KeyboardSettings(preferences).selectNextLanguage(dictationLanguages)
        renderLanguage()
    }

    private fun renderToneChips() {
        if (!::toneRow.isInitialized) return
        toneRow.removeAllViews()
        toneRow.setPadding(0, 0, 0, 0)
        val toneIds = activeToneIds.filter(toneById::containsKey)
        val entries = manualSmartModeRules.size + toneIds.size
        if (entries == 0) {
            toneScroller.visibility = View.GONE
            return
        }
        toneScroller.visibility = View.VISIBLE
        var position = 0
        manualSmartModeRules.forEach { workflow ->
            val chip = makeChip(workflow.name, workflow.id) {
                onWorkflowChipTap(workflow.id)
            }
            chip.contentDescription = "Smart Mode: ${workflow.name}"
            styleChip(chip, workflow.id == selectedWorkflowId)
            toneRow.addView(chip, chipLayout(++position < entries))
        }
        toneIds.forEach { id ->
            val chip = makeChip(toneById.getValue(id).name, id) { onToneChipTap(id) }
            styleChip(chip, id == selectedToneId)
            toneRow.addView(chip, chipLayout(++position < entries))
        }
        centerChips(toneScroller, toneRow)
    }

    private fun renderFormatChips() {
        if (!::formatRow.isInitialized) return
        formatRow.removeAllViews()
        formatRow.setPadding(0, 0, 0, 0)
        KEYBOARD_FORMATS.forEachIndexed { index, format ->
            val chip = makeChip(format.name, format.id) { onFormatChipTap(format.id) }
            styleChip(chip, format.id == selectedFormatId)
            formatRow.addView(chip, chipLayout(index < KEYBOARD_FORMATS.lastIndex))
        }
        centerChips(formatScroller, formatRow)
    }

    private fun makeChip(label: String, identifier: String, action: () -> Unit): TextView =
        TextView(this).apply {
            text = label
            textSize = 13f
            setPadding(dp(14f).toInt(), dp(6f).toInt(), dp(14f).toInt(), dp(6f).toInt())
            gravity = Gravity.CENTER
            isClickable = true
            isFocusable = true
            tag = identifier
            setOnClickListener { action() }
            setOnTouchListener(scaleFeedback(.9f))
        }

    private fun chipLayout(hasTrailingGap: Boolean) = LinearLayout.LayoutParams(
        LinearLayout.LayoutParams.WRAP_CONTENT,
        dp(32f).toInt(),
    ).also { if (hasTrailingGap) it.marginEnd = dp(8f).toInt() }

    private fun styleChip(chip: TextView, selected: Boolean) {
        val fill = when {
            selected -> Color.argb(51, 143, 156, 255)
            darkTheme -> COLOR_UTILITY_DARK
            else -> COLOR_UTILITY_LIGHT
        }
        val label = if (selected) COLOR_ACCENT else if (darkTheme) Color.WHITE else Color.BLACK
        chip.setTextColor(label)
        setRoundedFill(chip, fill, 16f)
    }

    private fun onWorkflowChipTap(id: String) {
        selectedWorkflowId = KeyboardSettings(preferences).toggleWorkflow(selectedWorkflowId, id)
        renderToneChips()
    }

    private fun onToneChipTap(id: String) {
        selectedToneId = id
        KeyboardSettings(preferences).selectTone(id)
        renderToneChips()
    }

    private fun onFormatChipTap(id: String) {
        selectedFormatId = KeyboardSettings(preferences).toggleFormat(selectedFormatId, id)
        renderFormatChips()
    }

    private fun centerChips(scroller: HorizontalScrollView, row: LinearLayout) {
        scroller.post {
            val sideInset = max(0, (scroller.width - row.width) / 2)
            row.setPadding(sideInset, row.paddingTop, sideInset, row.paddingBottom)
            scroller.scrollTo(0, 0)
        }
    }

    private fun setRoundedFill(view: View, color: Int, radiusDp: Float) {
        val fill = (view.background as? GradientDrawable)?.mutate() as? GradientDrawable
            ?: GradientDrawable()
        fill.shape = GradientDrawable.RECTANGLE
        fill.cornerRadius = dp(radiusDp)
        fill.setColor(color)
        view.background = fill
    }

    private fun startConfigPolling() {
        stopConfigPolling()
        keyboardCounterTask = periodicTask(CONFIG_POLL_MS, ::checkConfigCounter).also(mainHandler::post)
    }

    private fun stopConfigPolling() {
        keyboardCounterTask?.let(mainHandler::removeCallbacks)
        keyboardCounterTask = null
    }

    private fun checkConfigCounter() {
        val next = preferences.getInt(KEY_KEYBOARD_UPDATE_COUNTER, 0)
        if (next == keyboardCounter) return
        keyboardCounter = next
        reloadKeyboardConfig()
    }

    private fun startMemberPolling() {
        stopMemberPolling()
        memberTask = periodicTask(MEMBER_REFRESH_INTERVAL_MS, ::refreshMember)
        memberTask?.let { mainHandler.postDelayed(it, MEMBER_REFRESH_INTERVAL_MS) }
    }

    private fun stopMemberPolling() {
        memberTask?.let(mainHandler::removeCallbacks)
        memberTask = null
    }

    private fun periodicTask(delay: Long, action: () -> Unit): Runnable =
        object : Runnable {
            override fun run() {
                action()
                mainHandler.postDelayed(this, delay)
            }
        }

    private fun refreshMember() {
        val functionUrl = preferences.getString(KEY_CONVEX_URL, null)
        if (functionUrl.isNullOrBlank()) {
            member = null
            if (::statusRow.isInitialized) setStatusBannerVisible(false)
            return
        }
        worker.execute {
            val config = session.config()
            val freshMember = config?.let { KeyboardRepositoryFactory.member(it, ::debug) }
            mainHandler.post {
                member = freshMember
                updateStatusBanner()
            }
        }
    }

    private fun updateStatusBanner() {
        if (!::statusRow.isInitialized) return
        val transcriptionMode = preferences.getString(KEY_AI_TRANSCRIPTION_MODE, "cloud") ?: "cloud"
        val generationMode = preferences.getString(KEY_AI_POST_PROCESSING_MODE, "cloud") ?: "cloud"
        if (transcriptionMode == "api" && generationMode == "api") {
            setStatusBannerVisible(false)
            return
        }
        val copy = member?.let { KeyboardPolicy.trialCopy(it, System.currentTimeMillis()) }
        if (copy == null) {
            setStatusBannerVisible(false)
        } else {
            statusLabel.text = copy
            setStatusBannerVisible(true)
        }
    }

    private fun setStatusBannerVisible(show: Boolean) {
        if (show == statusVisible) return
        statusVisible = show
        statusAnimation?.cancel()
        val expanded = dp(20f).toInt()
        val layout = statusRow.layoutParams as LinearLayout.LayoutParams
        if (show) {
            statusRow.visibility = View.VISIBLE
            statusRow.alpha = 0f
            layout.height = 0
            statusRow.layoutParams = layout
            statusAnimation = heightAnimation(0, expanded, STATUS_SHOW_MS) { value, fraction ->
                layout.height = value
                statusRow.layoutParams = layout
                statusRow.alpha = fraction
            }.also(ValueAnimator::start)
            return
        }
        val start = statusRow.height.takeIf { it > 0 } ?: expanded
        statusAnimation = heightAnimation(start, 0, STATUS_HIDE_MS) { value, fraction ->
            layout.height = value
            statusRow.layoutParams = layout
            statusRow.alpha = 1f - fraction
        }.apply {
            addListener(object : AnimatorListenerAdapter() {
                override fun onAnimationEnd(animation: Animator) {
                    if (!statusVisible) {
                        layout.height = expanded
                        statusRow.layoutParams = layout
                        statusRow.visibility = View.GONE
                        statusRow.alpha = 0f
                    }
                }
            })
            start()
        }
    }

    private fun heightAnimation(
        from: Int,
        to: Int,
        length: Long,
        update: (Int, Float) -> Unit,
    ) = ValueAnimator.ofInt(from, to).apply {
        duration = length
        interpolator = DecelerateInterpolator()
        addUpdateListener { update(it.animatedValue as Int, it.animatedFraction) }
    }

    private fun transcribeRecording() {
        val editor = currentInputEditorInfo
        val connection = currentInputConnection
        val before = connection?.getTextBeforeCursor(4_096, 0)?.toString()
        val selection = connection?.getSelectedText(0)?.toString()
        val settings = KeyboardSettings(preferences)
        val snippets = settings.snippets()
        val readClipboard = { clipboardText() }
        val activeWorkflow = resolveActiveSmartModeRule(
            editor?.packageName,
            smartModeRules,
            selectedWorkflowId,
        )
        val workflowClipboard = if (activeWorkflow?.input == "clipboard") readClipboard() else null
        val configuredStt = preferences.getString(KEY_AI_TRANSCRIPTION_MODE, "cloud") ?: "cloud"
        val sttMode = when (activeWorkflow?.engine) {
            "local" -> "local"
            "cloud" -> "cloud"
            else -> configuredStt
        }
        val configuredGeneration = preferences.getString(KEY_AI_POST_PROCESSING_MODE, "cloud") ?: "cloud"
        val generationMode = if (activeWorkflow?.deterministic == true) "off" else configuredGeneration
        val currentTones = KeyboardSettings(preferences).snapshot(KEYBOARD_FORMATS).tones
        val selectedToneId = KeyboardPolicy.toneId(
            activeWorkflow,
            preferences.getString(KEY_SELECTED_TONE_ID, null),
            currentTones,
        )
        val selectedFormat = preferences.getString(KEY_SELECTED_FORMAT_ID, null)
            ?.let { id -> KEYBOARD_FORMATS.firstOrNull { it.id == id } }
        val shouldPostProcess = generationMode != "off" &&
            (selectedToneId != null || selectedFormat != null || activeWorkflow?.prompt != null)
        val needsCloud = sttMode == "cloud" || (shouldPostProcess && generationMode == "cloud")
        val (termOrder, terms) = settings.terms()
        val language = activeWorkflow?.language
            ?: preferences.getString(KEY_DICTATION_LANGUAGE, "en")
            ?: "en"
        val userName = preferences.getString(KEY_USER_NAME, null) ?: "User"
        val sttPrompt = KeyboardPolicy.transcriptionPrompt(termOrder, terms, userName, language)
        val providerLanguage = KeyboardPolicy.whisperLanguage(language)
        val sendsAfterInsert = activeWorkflow?.sendsAfterInsert == true && activeWorkflow.output != "copy"

        worker.execute {
            val config = if (needsCloud) {
                requireCloudConfig() ?: return@execute
            } else {
                null
            }
            val transcriber = KeyboardRepositoryFactory.transcription(preferences, config, sttMode)
            if (transcriber == null) {
                postError("Transcription not configured")
                return@execute
            }
            val rawTranscript = transcriber.transcribeSync(audioFile, sttPrompt, providerLanguage)
            if (rawTranscript.isNullOrBlank()) {
                postError("Transcription failed — try again")
                return@execute
            }

            val source = when (activeWorkflow?.input) {
                "selection" -> selection?.takeIf(String::isNotBlank) ?: rawTranscript
                "clipboard" -> workflowClipboard?.takeIf(String::isNotBlank) ?: rawTranscript
                else -> rawTranscript
            }
            val deterministicText = if (activeWorkflow?.transform == "literal") {
                source.trim()
            } else {
                SpokenFormatting.apply(source, language)
            }
            val tone = selectedToneId?.let(currentTones::get)
            val generatedText = if (shouldPostProcess) {
                generateText(
                    config,
                    generationMode,
                    deterministicText,
                    activeWorkflow?.prompt ?: tone?.prompt,
                    selectedFormat?.prompt,
                    userName,
                    language,
                )
            } else {
                deterministicText
            }
            val snippetClipboard = workflowClipboard ?: if (
                SnippetExpansion.requiresClipboard(snippets, generatedText)
            ) {
                readClipboard()
            } else {
                null
            }
            val finalText = SnippetExpansion.apply(
                generatedText,
                snippets,
                clipboard = snippetClipboard,
                app = editor?.packageName,
                selection = selection,
            ).trim()
            if (finalText.isEmpty()) {
                mainHandler.post { setPhase(Phase.IDLE) }
                return@execute
            }
            history.prepend(finalText, rawTranscript, selectedToneId, tone?.name)
            val insertion = DestinationInsertion.prepare(
                finalText,
                before,
                editor?.inputType ?: InputType.TYPE_CLASS_TEXT,
                editor?.imeOptions ?: EditorInfo.IME_ACTION_NONE,
            )
            mainHandler.post {
                deliverResult(activeWorkflow, finalText, insertion, sendsAfterInsert)
                setPhase(Phase.IDLE)
                refreshMember()
            }
        }
    }

    private fun requireCloudConfig(): RepoConfig? {
        val idToken = session.idToken()
        if (idToken == null) {
            postError("Sign in required — open Looper")
            return null
        }
        val url = preferences.getString(KEY_CONVEX_URL, null)
        if (url.isNullOrBlank()) {
            postError("Setup error — open Looper")
            return null
        }
        return RepoConfig(url, idToken)
    }

    private fun generateText(
        config: RepoConfig?,
        mode: String,
        transcript: String,
        tonePrompt: String?,
        formatPrompt: String?,
        userName: String,
        language: String,
    ): String {
        val generator = KeyboardRepositoryFactory.generation(preferences, config, mode)
            ?: return transcript
        val raw = generator.generateTextSync(
            KeyboardPolicy.postProcessingSystemPrompt(),
            KeyboardPolicy.postProcessingPrompt(
                transcript,
                tonePrompt,
                formatPrompt,
                userName,
                language,
            ),
            jsonResponse = true,
        )
        return raw?.takeIf(String::isNotBlank)?.let(KeyboardPolicy::processedText) ?: transcript
    }

    private fun deliverResult(
        workflow: KeyboardWorkflow?,
        plainText: String,
        insertion: String,
        sendsAfterInsert: Boolean,
    ) {
        if (workflow?.output == "copy") {
            val clipboard = getSystemService(Context.CLIPBOARD_SERVICE) as ClipboardManager
            clipboard.setPrimaryClip(ClipData.newPlainText("Looper workflow", plainText))
            return
        }
        if (workflow?.output == "insert") collapseSelectionToEnd()
        currentInputConnection?.commitText(insertion, 1)
        if (sendsAfterInsert) sendReturn()
    }

    private fun resolveActiveSmartModeRule(
        packageName: String?,
        rules: List<KeyboardWorkflow>,
        selectedWorkflowId: String?,
    ): KeyboardWorkflow? = KeyboardPolicy.activeWorkflow(packageName, rules, selectedWorkflowId)

    private fun collapseSelectionToEnd() {
        val connection = currentInputConnection ?: return
        val text = connection.getExtractedText(ExtractedTextRequest(), 0) ?: return
        val end = text.startOffset + max(text.selectionStart, text.selectionEnd)
        connection.setSelection(end, end)
    }

    private fun clipboardText(): String? = runCatching {
        val clipboard = getSystemService(Context.CLIPBOARD_SERVICE) as? ClipboardManager
        clipboard?.primaryClip
            ?.takeIf { it.itemCount > 0 }
            ?.getItemAt(0)
            ?.coerceToText(this)
            ?.toString()
    }.getOrNull()

    private fun postError(message: String) {
        mainHandler.post { showError(message) }
    }

    private fun handleDeleteTouch(view: View, event: MotionEvent): Boolean =
        when (event.actionMasked) {
            MotionEvent.ACTION_DOWN -> {
                view.isPressed = true
                beginDeleting()
                true
            }
            MotionEvent.ACTION_UP, MotionEvent.ACTION_CANCEL -> {
                view.isPressed = false
                stopDeleting()
                view.performClick()
                true
            }
            else -> false
        }

    private fun beginDeleting() {
        sendDeleteKey()
        stopDeleting()
        deleteTask = Runnable {
            val repeat = periodicTask(DELETE_REPEAT_MS) {
                if (deletingWords) deleteWord() else sendDeleteKey()
            }
            deleteTask = repeat
            repeat.run()
        }
        deleteTask?.let { mainHandler.postDelayed(it, DELETE_INITIAL_DELAY_MS) }
        wordDeleteTask = Runnable { deletingWords = true }
        wordDeleteTask?.let { mainHandler.postDelayed(it, WORD_DELETE_DELAY_MS) }
    }

    private fun stopDeleting() {
        deleteTask?.let(mainHandler::removeCallbacks)
        wordDeleteTask?.let(mainHandler::removeCallbacks)
        deleteTask = null
        wordDeleteTask = null
        deletingWords = false
    }

    private fun sendDeleteKey() {
        val connection = currentInputConnection ?: return
        connection.sendKeyEvent(KeyEvent(KeyEvent.ACTION_DOWN, KeyEvent.KEYCODE_DEL))
        connection.sendKeyEvent(KeyEvent(KeyEvent.ACTION_UP, KeyEvent.KEYCODE_DEL))
    }

    private fun deleteWord() {
        val connection = currentInputConnection ?: return
        val before = connection.getTextBeforeCursor(1_000, 0)?.toString().orEmpty()
        if (before.isEmpty()) {
            sendDeleteKey()
            return
        }
        val withoutTrailingSpace = before.removeSuffix(" ")
        val previousSpace = withoutTrailingSpace.lastIndexOf(' ')
        val count = if (previousSpace < 0) before.length else before.length - previousSpace
        connection.deleteSurroundingText(count, 0)
    }

    private fun sendReturn() {
        val connection = currentInputConnection ?: return
        val info = currentInputEditorInfo
        val action = (info?.imeOptions ?: 0) and EditorInfo.IME_MASK_ACTION
        if (action !in setOf(EditorInfo.IME_ACTION_NONE, EditorInfo.IME_ACTION_UNSPECIFIED) &&
            connection.performEditorAction(action)
        ) {
            return
        }
        val type = info?.inputType ?: 0
        val multiline = type and InputType.TYPE_TEXT_FLAG_MULTI_LINE != 0 ||
            type and InputType.TYPE_TEXT_FLAG_IME_MULTI_LINE != 0
        if (multiline) {
            connection.commitText("\n", 1)
        } else {
            connection.sendKeyEvent(KeyEvent(KeyEvent.ACTION_DOWN, KeyEvent.KEYCODE_ENTER))
            connection.sendKeyEvent(KeyEvent(KeyEvent.ACTION_UP, KeyEvent.KEYCODE_ENTER))
        }
    }

    private fun openLooper(showPaywall: Boolean = false) {
        val intent = packageManager.getLaunchIntentForPackage(packageName) ?: return
        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_SINGLE_TOP)
        if (showPaywall) intent.putExtra(EXTRA_SHOW_PAYWALL, true)
        runCatching { startActivity(intent) }
            .onFailure { debug("openMainApp failed: ${it.message}") }
    }

    private fun applySafeArea(root: View, content: FrameLayout) {
        val resize: (Int) -> Unit = { inset ->
            val safe = max(0, inset)
            content.layoutParams = content.layoutParams.apply { height = originalHeight + safe }
            content.setPadding(
                content.paddingLeft,
                content.paddingTop,
                content.paddingRight,
                originalBottomPadding + safe,
            )
        }
        root.setOnApplyWindowInsetsListener { _, insets ->
            val bottom = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
                max(
                    insets.getInsets(android.view.WindowInsets.Type.systemBars()).bottom,
                    insets.getInsets(android.view.WindowInsets.Type.systemGestures()).bottom,
                )
            } else {
                @Suppress("DEPRECATION")
                insets.systemWindowInsetBottom
            }
            resize(bottom)
            insets
        }
        root.post {
            root.rootWindowInsets?.let { insets ->
                val bottom = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
                    max(
                        insets.getInsets(android.view.WindowInsets.Type.systemBars()).bottom,
                        insets.getInsets(android.view.WindowInsets.Type.systemGestures()).bottom,
                    )
                } else {
                    @Suppress("DEPRECATION")
                    insets.systemWindowInsetBottom
                }
                resize(bottom)
            }
        }
        root.requestApplyInsets()
    }

    private fun dp(value: Float): Float = value * resources.displayMetrics.density

    private fun debug(message: String) {
        Log.d("[LooperKB]", message)
        debugCopy = message
    }

    override fun onFinishInput() {
        super.onFinishInput()
        if (phase == Phase.RECORDING) {
            recorder.stop()
            setPhase(Phase.IDLE)
        }
    }

    override fun onDestroy() {
        super.onDestroy()
        stopConfigPolling()
        stopMemberPolling()
        stopDeleting()
        recorder.stop()
        waveform?.end()
        progress?.end()
        worker.shutdownNow()
    }

    class AudioWaveformView(context: Context) : KeyboardWaveform(context) {
        var waveColor: Int
            get() = color
            set(value) {
                color = value
            }
        var isActive: Boolean
            get() = listening
            set(value) {
                listening = value
            }

        fun startAnimating() = begin()
        fun stopAnimating() = end()
        fun updateLevel(level: Float) = update(level)
    }

    class IndeterminateProgressView(context: Context) : KeyboardProgress(context) {
        var barColor: Int
            get() = color
            set(value) {
                color = value
            }

        fun startAnimating() = begin()
        fun stopAnimating() = end()
    }

    companion object {
        const val PREFS_NAME = "looper_keyboard"
        const val KEY_CONVEX_REFRESH_TOKEN = "looper_convex_refresh_token"
        const val KEY_CONVEX_URL = "looper_convex_url"
        const val KEY_USER_NAME = "looper_user_name"
        const val KEY_DICTATION_LANGUAGE = "looper_dictation_language"
        const val KEY_DICTATION_LANGUAGES = "looper_dictation_languages"
        const val KEY_SELECTED_TONE_ID = "looper_selected_tone_id"
        const val KEY_ACTIVE_TONE_IDS = "looper_active_tone_ids"
        const val KEY_TONE_BY_ID = "looper_tone_by_id"
        const val KEY_SELECTED_FORMAT_ID = "looper_selected_format_id"
        const val KEY_SMART_MODE_RULES = "looper_smart_mode_rules"
        const val KEY_SELECTED_WORKFLOW_ID = "looper_selected_workflow_id"
        const val KEY_TERM_IDS = "looper_term_ids"
        const val KEY_TERM_BY_ID = "looper_term_by_id"
        const val KEY_SNIPPETS = "looper_snippets"
        const val KEY_TRANSCRIPTIONS = "looper_transcriptions"
        const val KEY_MIXPANEL_UID = "looper_mixpanel_uid"
        const val KEY_MIXPANEL_TOKEN = "looper_mixpanel_token"
        const val KEY_APP_UPDATE_COUNTER = "looper_app_update_counter"
        const val KEY_KEYBOARD_UPDATE_COUNTER = "looper_keyboard_update_counter"
        const val KEY_AI_TRANSCRIPTION_MODE = "looper_ai_transcription_mode"
        const val KEY_AI_POST_PROCESSING_MODE = "looper_ai_post_processing_mode"
        const val KEY_AI_TRANSCRIPTION_PROVIDER = "looper_ai_transcription_provider"
        const val KEY_AI_TRANSCRIPTION_API_KEY = "looper_ai_transcription_api_key"
        const val KEY_AI_POST_PROCESSING_PROVIDER = "looper_ai_post_processing_provider"
        const val KEY_AI_POST_PROCESSING_API_KEY = "looper_ai_post_processing_api_key"
        const val KEY_AI_TRANSCRIPTION_BASE_URL = "looper_ai_transcription_base_url"
        const val KEY_AI_POST_PROCESSING_BASE_URL = "looper_ai_post_processing_base_url"
        const val KEY_AI_TRANSCRIPTION_MODEL = "looper_ai_transcription_model"
        const val KEY_AI_POST_PROCESSING_MODEL = "looper_ai_post_processing_model"
        const val KEY_AI_TRANSCRIPTION_AZURE_REGION = "looper_ai_transcription_azure_region"
        const val KEY_LOCAL_STT_MODEL_PATH = "looper_local_stt_model_path"
        const val EXTRA_SHOW_PAYWALL = "looper_show_paywall"

        const val COLOR_ACCENT = 0xFF626BD5.toInt()
        const val COLOR_GRAY_LIGHT = 0xFFC7C7CC.toInt()
        const val COLOR_GRAY_DARK = 0xFF48484A.toInt()
        const val COLOR_UTILITY_LIGHT = 0xFFD1D1D6.toInt()
        const val COLOR_UTILITY_DARK = 0xFF3A3A3C.toInt()
        const val MEMBER_REFRESH_INTERVAL_MS = 300_000L
        const val MAX_TRANSCRIPTION_ENTRIES = 50
        const val STYLE_INSTRUCTIONS_OPEN = "<style-instructions>"
        const val FORMAT_INSTRUCTIONS_OPEN = "<format-instructions>"
        val SMART_MODE_PRESET_TO_TONE_ID = mapOf(
            "polish" to "default",
            "literal" to "verbatim",
            "chat" to "chat",
            "email" to "email",
        )

        private const val CONFIG_POLL_MS = 1_000L
        private const val ERROR_DURATION_MS = 3_000L
        private const val STATUS_SHOW_MS = 220L
        private const val STATUS_HIDE_MS = 180L
        private const val DELETE_INITIAL_DELAY_MS = 400L
        private const val DELETE_REPEAT_MS = 80L
        private const val WORD_DELETE_DELAY_MS = 2_000L

        private val KEYBOARD_FORMATS = listOf(
            KeyboardFormat(
                id = "bullets",
                name = "Bullets",
                prompt = """
                    Reformat explicitly spoken points, steps, or action items as a bulleted list.
                    Start every item with '- ' on its own line and keep one complete idea per bullet.
                    Preserve the speaker's original order, wording, facts, dates, and level of certainty.
                    Do not turn a single thought into an arbitrary list. Do not add, merge, omit, or answer anything.
                """.trimIndent(),
            ),
            KeyboardFormat(
                id = "email",
                name = "Email",
                prompt = """
                    Reformat the content as an email with short paragraphs and blank lines between the greeting, body, and sign-off when they exist.
                    Preserve a greeting or closing that the speaker dictated. Do not invent a recipient, subject, signature, closing, or any other detail.
                    Convert explicitly spoken multiple points or action items into a bulleted or numbered list when that makes the email easier to scan.
                    Keep the speaker's register, facts, dates, and intent. Remove only disfluencies, false starts, and later-corrected wording.
                """.trimIndent(),
            ),
            KeyboardFormat(
                id = "message",
                name = "Message",
                prompt = """
                    Reformat the content as a concise chat message that sounds like the speaker typed it.
                    Keep it casual and natural. Do not over-structure, formalize, or over-punctuate it.
                    Preserve bluntness, personality, and every meaningful idea. Remove filler words, stutters, false starts, and words the speaker later corrected.
                    Do not add greetings, sign-offs, details, or exclamation marks unless the speaker expressed them. Use bullets only when the speaker explicitly dictated a list.
                """.trimIndent(),
            ),
            KeyboardFormat(
                id = "todo",
                name = "To-do",
                prompt = """
                    Reformat the speaker's explicit tasks and follow-ups as a checklist.
                    Start each task with '- [ ] ' on its own line. Keep one actionable task per line and preserve the speaker's original order, owners, dates, and qualifiers.
                    Keep every explicit task, but do not invent tasks or turn background context, questions, or decisions into tasks.
                    Remove filler words, false starts, and wording the speaker later corrected without changing the requested work.
                """.trimIndent(),
            ),
        )
    }
}
