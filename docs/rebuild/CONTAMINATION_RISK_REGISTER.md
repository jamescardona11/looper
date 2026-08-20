# Registro de riesgo de procedencia

La auditoría de corpus mide coincidencia textual agregada. Es una señal de
revisión, no una prueba de clean-room, autoría independiente ni una conclusión
legal. Los resultados numéricos caducan con cada cambio del árbol y deben
regenerarse antes de usarlos.

## Gate reproducible

```sh
python3 tools/provenance/corpus-audit.py /tmp/looper-audit \
  --refs /ruta/a/voices/refs
python3 tools/provenance/history-audit.py
node tools/provenance/check-staged.mjs
```

El snapshot del 18 de agosto de 2026 no encontró filas bloqueantes en el umbral
técnico configurado. Eso no cierra los casos históricos ni sustituye revisión
legal.

## Casos manuales abiertos

| Superficie | Riesgo que sigue abierto |
| --- | --- |
| `apps/desktop/src-tauri/src/core/keyboard/{macos,catalog,mod}.rs` | Faltan permisos, hotkeys globales y layouts físicos en hosts macOS/Windows reales. |
| `apps/desktop/src-tauri/src/music.rs` | Falta observar pause/duck y restauración de volumen en reproductores reales. |
| `apps/desktop/src-tauri/src/platform/macos/audio_devices.rs` | Falta registrar listeners CoreAudio con permisos reales. |
| `apps/desktop/src/features/settings/components/SpeechModelPanel.tsx` | Falta evidencia visual y contra proveedores reales. |
| `apps/desktop/src-tauri/src/recorder.rs` | Faltan micrófono, permisos, acústica y VAD en vivo. |
| `apps/desktop/src-tauri/src/analytics.rs` | Falta envío real a PostHog y ejecución empaquetada. |
| `apps/mobile/targets/keyboard/KeyboardViewController.swift` | Faltan extensión, permisos, captura e inserción en dispositivo real. |
| `apps/mobile/targets/_shared/DarwinNotificationManager.swift` | Falta prueba entre procesos/extensión real. |
| `apps/mobile/targets/widgets/MeetingLiveActivity.swift` | Falta compilación y observación del widget en dispositivo. |
| `apps/mobile/targets/keyboard/Repos/MemberRepo.swift` | Falta query Convex real dentro del sandbox de la extensión. |
| `apps/mobile/targets/keyboard/Types/SharedWorkflow.swift` | La referencia histórica y su licencia no están verificadas; requiere revisión antes de redistribución independiente. |

## Regla de remediación

Cambiar nombres, mover archivos o eliminar tests no constituye una
reimplementación. Cada caso solo se cierra conservando la licencia y los avisos
aplicables, o mediante una reimplementación sustantiva basada en contratos
observables, con pruebas nuevas y decisiones documentadas.

Los módulos `import/handy.rs` e `import/wispr.rs` fueron retirados del árbol.
Los nombres Handy/Wispr en herramientas de auditoría identifican referencias
del corpus, no dependencias distribuidas.
