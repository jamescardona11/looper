const {
  AndroidConfig,
  withAppBuildGradle,
  withAndroidManifest,
  withDangerousMod,
  withMainApplication,
  withXcodeProject,
} = require("expo/config-plugins");
const fs = require("node:fs");
const path = require("node:path");

function copyDirectory(source, destination) {
  fs.mkdirSync(destination, { recursive: true });
  fs.cpSync(source, destination, { recursive: true, force: true });
}

function withIosBridge(config) {
  return withDangerousMod(config, [
    "ios",
    async (config) => {
      const projectName = config.modRequest.projectName || "App";
      const destination = path.join(
        config.modRequest.platformProjectRoot,
        projectName,
        "LooperKeyboard",
      );
      copyDirectory(path.join(config.modRequest.projectRoot, "native/ios"), destination);
      return config;
    },
  ]);
}

function withIosBridgeSources(config) {
  return withXcodeProject(config, (config) => {
    const projectName = config.modRequest.projectName || "App";
    const project = config.modResults;
    const targetUuid = project.getFirstTarget().uuid;
    const groupKey =
      project.findPBXGroupKey({ name: projectName }) ||
      project.findPBXGroupKey({ path: projectName });
    for (const file of [
      "LooperKeyboardModule.swift",
      "LooperKeyboardModule.m",
      "LooperLiveActivityModule.swift",
      "LooperLiveActivityModule.m",
    ]) {
      const relativePath = `${projectName}/LooperKeyboard/${file}`;
      if (!project.hasFile(relativePath))
        project.addSourceFile(relativePath, { target: targetUuid }, groupKey);
    }
    return config;
  });
}

function withAndroidKeyboardSources(config) {
  return withDangerousMod(config, [
    "android",
    async (config) => {
      const root = config.modRequest.projectRoot;
      const androidRoot = config.modRequest.platformProjectRoot;
      copyDirectory(
        path.join(root, "native/android/com"),
        path.join(androidRoot, "app/src/main/java/com"),
      );
      copyDirectory(
        path.join(root, "native/android/res"),
        path.join(androidRoot, "app/src/main/res"),
      );
      return config;
    },
  ]);
}

function withAndroidKeyboardPackage(config) {
  return withMainApplication(config, (config) => {
    const contents = config.modResults.contents;
    if (contents.includes("add(LooperKeyboardPackage())")) return config;
    config.modResults.contents = contents.replace(
      /PackageList\(this\)\.packages\.apply\s*\{/,
      "PackageList(this).packages.apply {\n          add(LooperKeyboardPackage())",
    );
    return config;
  });
}

function withAndroidSherpaClasses(config) {
  return withAppBuildGradle(config, (config) => {
    const classesJar =
      'compileOnly files("${rootProject.projectDir}/../../../node_modules/react-native-sherpa-onnx/android/build/sherpa-onnx-classes/classes.jar")';
    if (!config.modResults.contents.includes(classesJar)) {
      config.modResults.contents = config.modResults.contents.replace(
        "dependencies {",
        `dependencies {\n    // LooperIME uses the Kotlin API bundled by react-native-sherpa-onnx at runtime.\n    // Autolinking owns the AAR and native libraries; this is compile-only.\n    ${classesJar}`,
      );
    }

    const extractTask =
      'tasks.withType(org.jetbrains.kotlin.gradle.tasks.KotlinCompile).configureEach {\n    dependsOn(":react-native-sherpa-onnx:extractSherpaOnnxClasses")\n}';
    if (
      !config.modResults.contents.includes(":react-native-sherpa-onnx:extractSherpaOnnxClasses")
    ) {
      config.modResults.contents = `${config.modResults.contents.trimEnd()}\n\n${extractTask}\n`;
    }
    return config;
  });
}

function withAndroidInputMethod(config) {
  return withAndroidManifest(config, (config) => {
    const androidPackage = config.android?.package;
    if (!androidPackage) throw new Error("android.package is required for the Looper keyboard");
    const application = AndroidConfig.Manifest.getMainApplicationOrThrow(config.modResults);
    application.service = application.service ?? [];
    const name = `${androidPackage}.LooperIME`;
    if (application.service.some((service) => service.$?.["android:name"] === name)) return config;
    application.service.push({
      $: {
        "android:name": name,
        "android:exported": "true",
        "android:permission": "android.permission.BIND_INPUT_METHOD",
      },
      "intent-filter": [{ action: [{ $: { "android:name": "android.view.InputMethod" } }] }],
      "meta-data": [
        { $: { "android:name": "android.view.im", "android:resource": "@xml/method" } },
      ],
    });
    return config;
  });
}

module.exports = (config) => {
  config = withIosBridge(config);
  config = withIosBridgeSources(config);
  config = withAndroidKeyboardSources(config);
  config = withAndroidKeyboardPackage(config);
  config = withAndroidSherpaClasses(config);
  return withAndroidInputMethod(config);
};
