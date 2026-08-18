plugins {
    kotlin("jvm") version "2.1.20"
}

val androidJar = file("${System.getProperty("user.home")}/Library/Android/sdk/platforms/android-36/android.jar")

repositories {
    mavenCentral()
}

dependencies {
    implementation("org.json:json:20180813")
    implementation(files(androidJar))
}

kotlin {
    jvmToolchain(17)
}

sourceSets {
    main {
        kotlin.setSrcDirs(listOf("../android/com", "src/main/kotlin"))
        kotlin.include(
            "j11/looper/mobile/LooperIME.kt",
            "j11/looper/mobile/KeyboardDomain.kt",
            "j11/looper/mobile/KeyboardRecorder.kt",
            "j11/looper/mobile/KeyboardServices.kt",
            "j11/looper/mobile/KeyboardVisuals.kt",
            "j11/looper/mobile/DestinationInsertion.kt",
            "j11/looper/mobile/SnippetExpansion.kt",
            "j11/looper/mobile/SpokenEntities.kt",
            "j11/looper/mobile/SpokenFormatting.kt",
            "j11/looper/mobile/repos/ApiUtils.kt",
            "j11/looper/mobile/repos/GenerateTextRepo.kt",
            "j11/looper/mobile/repos/RepoConfig.kt",
            "j11/looper/mobile/repos/TranscribeAudioRepo.kt",
            "com/j11/looper/mobile/**/*.kt",
        )
    }
}

tasks.register<JavaExec>("contractTest") {
    dependsOn(tasks.named("classes"))
    val orderedRuntime = configurations.runtimeClasspath.get().files.sortedBy {
        if (it.canonicalFile == androidJar.canonicalFile) 1 else 0
    }
    classpath = files(sourceSets.main.get().output, orderedRuntime)
    mainClass.set("com.j11.looper.mobile.ContractChecksKt")
}
