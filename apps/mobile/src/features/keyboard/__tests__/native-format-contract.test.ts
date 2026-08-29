import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const readNativeFile = (relativePath: string) =>
  readFileSync(fileURLToPath(new URL(relativePath, import.meta.url)), "utf8");

describe("native keyboard output formats", () => {
  it("keeps the native format contract aligned across iOS and Android", () => {
    const iosPrompts = readNativeFile("../../../../targets/keyboard/Utils/PromptUtils.swift");
    const iosKeyboard = readNativeFile("../../../../targets/keyboard/KeyboardViewController.swift");
    const androidKeyboard = readNativeFile(
      "../../../../native/android/com/j11/looper/mobile/LooperIME.kt",
    );

    for (const [id, fragment] of [
      ["bullets", "Reformat explicitly spoken points, steps, or action items"],
      ["email", "Reformat the content as an email with short paragraphs"],
      ["message", "Reformat the content as a concise chat message"],
      ["todo", "Reformat the speaker's explicit tasks and follow-ups as a checklist"],
    ]) {
      expect(iosPrompts).toContain(`id: "${id}"`);
      expect(androidKeyboard).toContain(`id = "${id}"`);
      expect(iosPrompts).toContain(fragment);
      expect(androidKeyboard).toContain(fragment);
    }

    expect(iosPrompts).toContain("Start each task with '- [ ] '");
    expect(androidKeyboard).toContain("Start each task with '- [ ] '");

    // A tone defines wording while a format defines structure; both can run
    // together as one product-level transformation contract.
    expect(iosPrompts).toContain("<style-instructions>");
    expect(iosPrompts).toContain("<format-instructions>");
    expect(androidKeyboard).toContain("<style-instructions>");
    expect(androidKeyboard).toContain("<format-instructions>");
    expect(iosKeyboard).toContain("capturedTone != nil || capturedFormat != nil");
    expect(androidKeyboard).toContain("selectedToneId != null || selectedFormat != null");
  });

  it("keeps Studio sync keys aligned across iOS and Android", () => {
    const iosModule = readNativeFile("../../../../native/ios/LooperKeyboardModule.swift");
    const iosKeyboard = readNativeFile("../../../../targets/keyboard/KeyboardViewController.swift");
    const androidModule = readNativeFile(
      "../../../../native/android/com/j11/looper/mobile/LooperKeyboardModule.kt",
    );
    const androidKeyboard = readNativeFile(
      "../../../../native/android/com/j11/looper/mobile/LooperIME.kt",
    );

    for (const key of [
      "looper_active_tone_ids",
      "looper_tone_by_id",
      "looper_selected_tone_id",
      "looper_smart_mode_rules",
    ]) {
      expect(iosModule).toContain(key);
      expect(androidKeyboard).toContain(key);
    }
    expect(androidModule).toContain('payload.getArray("smartModeRules")');
    expect(androidModule).toContain('payload.getMap("toneById")');
    expect(androidModule).toContain("KEY_KEYBOARD_UPDATE_COUNTER");
    expect(androidKeyboard).toContain("manualSmartModeRules");
    expect(androidKeyboard).toContain(`contentDescription = "Smart Mode: \${workflow.name}"`);
    expect(androidKeyboard).toContain("resolveActiveSmartModeRule");
    expect(iosModule).toContain("looper_widget_weekly_word_count");
    expect(iosModule).toContain("WidgetCenter.shared.reloadAllTimelines()");
    expect(iosModule).toContain("looper_keyboard_has_full_access");
    expect(iosKeyboard).toContain("looper_keyboard_has_full_access");
    expect(iosKeyboard).toContain("No se detectó voz — inténtalo de nuevo");
    expect(iosKeyboard).toContain("Transcripción con conexión");
    expect(iosKeyboard).not.toContain("Transcripción local · sin conexión");
  });

  it("keeps transformation controls compact in the iOS keyboard", () => {
    const iosKeyboard = readNativeFile("../../../../targets/keyboard/KeyboardViewController.swift");

    expect(iosKeyboard).toContain("transformSelectorButton");
    expect(iosKeyboard).toContain("transformationPanel");
    expect(iosKeyboard).toContain("updateTransformationSummary");
    expect(iosKeyboard).toContain("updateTransformationOptions");
    expect(iosKeyboard).toContain('title: "Sin estilo"');
    expect(iosKeyboard).toContain('detail: "Smart"');
    expect(iosKeyboard).toContain("pillButton.widthAnchor.constraint(equalToConstant: 64)");
    expect(iosKeyboard).toContain(
      "pillButton.centerXAnchor.constraint(equalTo: dictationRail.centerXAnchor)",
    );
    expect(iosKeyboard).toContain("private enum Layout");
    expect(iosKeyboard).toContain("static let contentHeight: CGFloat = 240");
    expect(iosKeyboard).toContain("private final class LooperLogoView");
    expect(iosKeyboard).toContain('button.accessibilityLabel = "Looper"');
    expect(iosKeyboard).toContain("Solo escucha después de pulsar el micrófono.");
    expect(iosKeyboard).toContain("button.heightAnchor.constraint(equalToConstant: 44)");
    expect(iosKeyboard).toContain('button.accessibilityLabel = "Ver comandos hablados"');
    expect(iosKeyboard).toContain('title.text = "Comandos hablados"');
    expect(iosKeyboard).toContain("«modo literal» · «fin modo literal»");
    expect(iosKeyboard).toContain("private func makeCommandsGuide() -> UIView");
    expect(iosKeyboard).toContain("inputView?.allowsSelfSizing = true");
    expect(iosKeyboard).toContain(
      "preferredContentSize = CGSize(width: 0, height: Layout.contentHeight)",
    );
    expect(iosKeyboard).toContain(
      "view.heightAnchor.constraint(equalToConstant: Layout.contentHeight)",
    );
    expect(iosKeyboard).not.toContain("heightAnchor.constraint(equalToConstant: 286)");
    expect(iosKeyboard).toContain(
      "transformSelectorButton.bottomAnchor.constraint(equalTo: view.bottomAnchor, constant: -12)",
    );
    expect(iosKeyboard).toContain(
      "dictationRail.bottomAnchor.constraint(equalTo: transformSelectorButton.topAnchor, constant: -4)",
    );
    expect(iosKeyboard).toContain('deleteButton.accessibilityLabel = "Borrar"');
    expect(iosKeyboard).toContain("private let dotSpacing: CGFloat = 3");
    expect(iosKeyboard).toContain("private let baseDotRadius: CGFloat = 0.9");
    expect(iosKeyboard).toContain("private let activeDotRadius: CGFloat = 1.0");
    expect(iosKeyboard).toContain("private let highlightColor = UIColor.white");
    // La señal ocupa el ancho del rail: a 32x18 la animación era invisible.
    expect(iosKeyboard).toContain(
      "waveformView.leadingAnchor.constraint(equalTo: dictationRail.leadingAnchor, constant: 8)",
    );
    expect(iosKeyboard).toContain("waveformView.heightAnchor.constraint(equalToConstant: 26)");
    // Los dos umbrales que la mantenían apagada. Están en amplitud lineal, no
    // en dB: subirlos otra vez deja la rejilla plana con voz normal.
    expect(iosKeyboard).toContain("private let signalFloor: CGFloat = 0.002");
    expect(iosKeyboard).toContain("private let minimumReference: CGFloat = 0.004");
    expect(iosKeyboard).toContain(
      "let columnSmoothing: CGFloat = desired > columnLevels[index] ? 0.5 : 0.1",
    );
    expect(iosKeyboard).not.toContain("private struct WaveConfig");
    expect(iosKeyboard).toContain("progressView?.barColor = Palette.accent");
    expect(iosKeyboard).not.toContain('for (index, iconName) in ["at", "space"');
    expect(iosKeyboard).not.toContain("onUtilButtonTap");
    expect(iosKeyboard).not.toContain("toneContainer = UIScrollView()");
    expect(iosKeyboard).not.toContain("formatContainer = UIScrollView()");
  });
});
