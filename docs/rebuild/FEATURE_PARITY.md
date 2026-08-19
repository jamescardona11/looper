# Matriz de paridad y evidencia

El estado `automated` significa que existen pruebas locales; `manual` requiere
una ejecución real del producto; `pending` no debe presentarse como cerrado.

| Feature | Contrato preservado | Evidencia actual | Estado |
| --- | --- | --- | --- |
| Shell y Home desktop | arranque, navegación, resumen diario | Tauri real + captura/video + suite desktop | manual |
| Settings y permisos | persistencia, permisos y modelos | Bundle macOS actual: Privacy & Permissions real, Microphone habilitado, enlaces reales a Microphone/Accessibility/Input Monitoring de System Settings, Processing & Models y toggle de overlay reversible | manual |
| Dictado global | hotkey, captura, STT e inserción | Hotkey/pill reales; micrófono acústico + Parakeet real; smoke actual de inserción/undo en TextEdit con Accessibility/Input Monitoring | manual |
| Capture Pill | estados, overlays y cancelación | Hotkey `Fn` real, pill visible y suite Rust | manual |
| Historial y Memory | búsqueda, borrado, exportación | CLI real: search/get/stats/export contra la base viva + suite desktop | manual |
| Library | cola, SQLite, importación y playback | CLI Tauri real: import/status/list/export + integración Rust | manual |
| Importación móvil | selector, preview y aplicación de datos | Android completó DocumentsUI e importación; iOS abre Document Picker real, pero falta seleccionar y confirmar un archivo | pending |
| Meetings | captura, transcript, notas y recuperación | Desktop Tauri real con micrófono/Parakeet; Meeting real en Android/iOS simulator | manual |
| Dictionary y workflows | reemplazos, snippets y formato | CLI real add/list/remove + suite desktop/mobile | manual |
| Onboarding, licencia y updates | estados, entitlement y descarga | suite desktop/Rust | automated |
| Teclado iOS/Android | IME, App Group e inserción | IME Android real en `emulator-5554` (inserción `@`, formato Email, listening/error); extensión `LooperKeyboard` real en iOS Simulator (Ready/Listening/Stop); dispositivo físico bloqueado por cuenta/perfiles | pending |
| Audio y motores | captura, VAD, chunking y timestamps | Micrófono macOS real + Parakeet INT8 + fixtures; dispositivos físicos móviles pendientes | manual |
| Web shell | onboarding, asistente y transcribe | Chromium real: onboarding/navegación; upload llegó a Convex, pero Deepgram falló sin API key y el asistente no tiene clave LLM | pending |

Conteo estricto actual: 10/13 capacidades cerradas (76,9%); 3 permanecen
`pending`: selección/confirmación de archivo en iOS, dispositivo físico para
teclado/audio y credenciales externas para web. Input Monitoring se dejó sin
autorizar: System Settings no muestra todavía una entrada Looper para ese
permiso y no se modificó una autorización de seguridad durante la prueba.

Esta tabla separa evidencia estática, local y de dispositivo. No convierte un
resultado automático en una afirmación de equivalencia visual o legal.

La evidencia real está detallada en
[`REAL_PRODUCT_EVIDENCE.md`](./REAL_PRODUCT_EVIDENCE.md). La app no llegó a
ejecutarse en un dispositivo físico: el build iOS se detuvo antes de instalar
por la cuenta/perfiles de firma y no había Android físico conectado. En
Android/iOS se usaron emulador y simulador; el audio móvil fue silencioso. Los
smoke tests de teclado sí ejercitaron las superficies IME reales en esos
targets, pero no prueban inserción en un host físico ni reconocimiento de voz
humana en hardware real. El bloque desktop de Settings/permisos sí se ejecutó
contra el bundle macOS actual; además, la selección/confirmación de archivo en
iOS sigue pendiente, junto con lo que requiere hardware físico o servicios
externos.
