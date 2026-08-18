package com.j11.looper.mobile.repos

import java.io.File

class LocalParakeetTranscribeAudioRepo(private val modelDirectory: File) : BaseTranscribeAudioRepo() {
    override fun transcribeSync(audioFile: File, prompt: String, language: String): String? = null
}
