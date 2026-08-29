import Foundation
import React
import UIKit
import WidgetKit

@objc(LooperKeyboard)
class LooperKeyboardModule: NSObject {
    private let appGroupId = "group.com.j11.looper.mobile"

    @objc
    static func requiresMainQueueSetup() -> Bool {
        false
    }

    @objc(sync:resolver:rejecter:)
    func sync(
        _ payload: NSDictionary,
        resolver resolve: @escaping RCTPromiseResolveBlock,
        rejecter reject: @escaping RCTPromiseRejectBlock
    ) {
        guard let defaults = UserDefaults(suiteName: appGroupId),
              let convexUrl = payload["convexUrl"] as? String,
              !convexUrl.isEmpty else {
            reject("INVALID_CONFIG", "convexUrl is required", nil)
            return
        }

        defaults.set(convexUrl, forKey: "looper_convex_url")
        // The keyboard extension has a separate sandbox and cannot read the
        // host app's downloaded Parakeet model.
        defaults.set("cloud", forKey: "looper_ai_transcription_mode")
        if let refreshToken = payload["refreshToken"] as? String, !refreshToken.isEmpty {
            defaults.set(refreshToken, forKey: "looper_convex_refresh_token")
        } else {
            defaults.removeObject(forKey: "looper_convex_refresh_token")
        }
        defaults.set(payload["termIds"] as? [String] ?? [], forKey: "looper_term_ids")
        writeJson(payload["termById"], key: "looper_term_by_id", defaults: defaults)
        writeJson(payload["snippets"], key: "looper_snippets", defaults: defaults)
        defaults.set(payload["activeToneIds"] as? [String] ?? [], forKey: "looper_active_tone_ids")
        writeJson(payload["toneById"], key: "looper_tone_by_id", defaults: defaults)
        writeJson(payload["smartModeRules"], key: "looper_smart_mode_rules", defaults: defaults)
        if let summary = payload["widgetSummary"] as? NSDictionary {
            defaults.set(summary["weeklyWordCount"] as? Int ?? 0, forKey: "looper_widget_weekly_word_count")
            defaults.set(summary["lastCaptureTitle"] as? String, forKey: "looper_widget_last_capture_title")
            defaults.set(summary["lastCaptureDetail"] as? String, forKey: "looper_widget_last_capture_detail")
            WidgetCenter.shared.reloadAllTimelines()
        }
        if let selectedToneId = payload["selectedToneId"] as? String, !selectedToneId.isEmpty {
            defaults.set(selectedToneId, forKey: "looper_selected_tone_id")
        } else {
            defaults.removeObject(forKey: "looper_selected_tone_id")
        }
        defaults.set(defaults.integer(forKey: "looper_app_update_counter") + 1, forKey: "looper_app_update_counter")
        defaults.synchronize()
        resolve(nil)
    }

    @objc(openSettings:rejecter:)
    func openSettings(
        _ resolve: @escaping RCTPromiseResolveBlock,
        rejecter reject: @escaping RCTPromiseRejectBlock
    ) {
        DispatchQueue.main.async {
            guard let url = URL(string: UIApplication.openSettingsURLString) else {
                reject("KEYBOARD_SETTINGS_FAILED", "Could not create settings URL", nil)
                return
            }
            UIApplication.shared.open(url, options: [:]) { opened in
                if opened { resolve(nil) }
                else { reject("KEYBOARD_SETTINGS_FAILED", "Could not open settings", nil) }
            }
        }
    }

    @objc(isEnabled:rejecter:)
    func isEnabled(
        _ resolve: @escaping RCTPromiseResolveBlock,
        rejecter _: @escaping RCTPromiseRejectBlock
    ) {
        // iOS no expone la lista de teclados. La extensión sí puede confirmar
        // acceso completo cuando se abre; reportamos esa última comprobación,
        // no una afirmación sobre los ajustes actuales del sistema.
        let defaults = UserDefaults(suiteName: appGroupId)
        defaults?.synchronize()
        resolve(defaults?.object(forKey: "looper_keyboard_has_full_access") as? Bool ?? false)
    }

    @objc(installDebugAudioFixture:resolver:rejecter:)
    func installDebugAudioFixture(
        _ source: String,
        resolver resolve: @escaping RCTPromiseResolveBlock,
        rejecter reject: @escaping RCTPromiseRejectBlock
    ) {
        #if !targetEnvironment(simulator)
        reject("FIXTURE_UNAVAILABLE", "Los fixtures sólo están disponibles en el simulador.", nil)
        return
        #else
        guard let sourceUrl = URL(string: source) else {
            reject("INVALID_FIXTURE_URL", "La URL del fixture no es válida.", nil)
            return
        }

        Task {
            do {
                let (audioData, response) = try await URLSession.shared.data(from: sourceUrl)
                if let httpResponse = response as? HTTPURLResponse,
                   !(200...299).contains(httpResponse.statusCode) {
                    throw NSError(
                        domain: "LooperKeyboard",
                        code: httpResponse.statusCode,
                        userInfo: [NSLocalizedDescriptionKey: "No se pudo descargar el fixture."]
                    )
                }
                guard !audioData.isEmpty,
                      let defaults = UserDefaults(suiteName: appGroupId),
                      let destination = DictationConstants.audioFileURL else {
                    throw NSError(
                        domain: "LooperKeyboard",
                        code: 1,
                        userInfo: [NSLocalizedDescriptionKey: "No se pudo preparar el fixture."]
                    )
                }

                try audioData.write(to: destination, options: .atomic)
                defaults.set(true, forKey: DictationConstants.keyboardFixtureReadyKey)
                defaults.set(DictationPhase.active.rawValue, forKey: DictationConstants.phaseKey)
                defaults.set(Date().timeIntervalSince1970, forKey: DictationConstants.heartbeatKey)
                defaults.synchronize()
                DarwinNotificationManager.shared.post(DictationConstants.dictationPhaseChanged)
                resolve(["bytes": audioData.count])
            } catch {
                reject("FIXTURE_INSTALL_FAILED", error.localizedDescription, error)
            }
        }
        #endif
    }

    @objc(debugFixtureState:rejecter:)
    func debugFixtureState(
        _ resolve: @escaping RCTPromiseResolveBlock,
        rejecter reject: @escaping RCTPromiseRejectBlock
    ) {
        #if !targetEnvironment(simulator)
        reject("FIXTURE_UNAVAILABLE", "Los fixtures sólo están disponibles en el simulador.", nil)
        return
        #else
        guard let defaults = UserDefaults(suiteName: appGroupId) else {
            reject("FIXTURE_UNAVAILABLE", "No se pudo abrir el grupo compartido.", nil)
            return
        }

        let state: [String: Any] = [
            "phase": defaults.string(forKey: DictationConstants.phaseKey) ?? "idle",
            "ready": defaults.bool(forKey: DictationConstants.keyboardFixtureReadyKey),
            "audioExists": DictationConstants.audioFileURL
                .map { FileManager.default.fileExists(atPath: $0.path) } ?? false,
        ]
        resolve(state)
        #endif
    }

    private func writeJson(_ value: Any?, key: String, defaults: UserDefaults) {
        guard let value, JSONSerialization.isValidJSONObject(value),
              let data = try? JSONSerialization.data(withJSONObject: value) else {
            defaults.removeObject(forKey: key)
            return
        }
        defaults.set(data, forKey: key)
    }
}
