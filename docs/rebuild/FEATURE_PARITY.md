# Matriz de paridad y evidencia

El estado `automated` significa que existen pruebas locales; `manual` requiere
una ejecución real del producto; `pending` no debe presentarse como cerrado.

| Feature | Contrato preservado | Evidencia actual | Estado |
| --- | --- | --- | --- |
| Shell y Home desktop | arranque, navegación, resumen diario | Tauri real + captura/video + suite desktop | manual |
| Settings y permisos | persistencia, permisos y modelos | suite desktop; permisos nativos no ejercitados | pending |
| Dictado global | hotkey, captura, STT e inserción | Hotkey `Fn`/pill reales; STT local Parakeet con fixture real; inserción TextEdit real; captura de micrófono pendiente | pending |
| Capture Pill | estados, overlays y cancelación | contratos de estado + suite Rust | automated |
| Historial y Memory | búsqueda, borrado, exportación | SQLite temporal + suite desktop | automated |
| Library | cola, SQLite, importación y playback | integración Rust + suite desktop | automated |
| Meetings | captura, transcript, notas y recuperación | contratos; sesión nativa real pendiente | pending |
| Dictionary y workflows | reemplazos, snippets y formato | suite desktop/mobile | automated |
| Onboarding, licencia y updates | estados, entitlement y descarga | suite desktop/Rust | automated |
| Teclado iOS/Android | IME, App Group e inserción | contratos Swift/Kotlin; proyecto Xcode sin schemes | pending |
| Audio y motores | captura, VAD, chunking y timestamps | Cargo + fixtures + Parakeet INT8 real; dispositivo físico pendiente | automated |

Esta tabla separa evidencia estática, local y de dispositivo. No convierte un
resultado automático en una afirmación de equivalencia visual o legal.
