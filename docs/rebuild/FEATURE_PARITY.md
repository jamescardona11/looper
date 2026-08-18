# Matriz de paridad de funcionalidades

Una fila no se marca como cerrada hasta que la implementación nueva conserva el
comportamiento observable y supera sus pruebas específicas. `baseline` describe
el producto que existe hoy; no implica que el código actual pueda entrar en Git.

| Feature | Superficie | Estado | Contratos que no se pueden perder | Evidencia de cierre |
| --- | --- | --- | --- | --- |
| Shell y ventanas Tauri | Desktop | baseline | `main`, `settings`, `toast`, `meeting-awareness`; ciclo de arranque y cierre | smoke de arranque, ventanas y salida |
| Settings y permisos | Desktop | baseline | persistencia, migraciones, micrófono, Accessibility, Input Monitoring, Screen Capture | pruebas de contrato + macOS manual |
| Dictado global | Desktop | baseline | hotkey, captura, STT local/cloud, inserción, fallback de copia y undo | Rust/TS + host TextEdit |
| Capture Pill | Desktop | baseline | estados de captura, dock/floating, posiciones y overlays | pruebas de estado + screenshots |
| Historial y memoria | Desktop/Web/Mobile/Backend | baseline | búsqueda, sync opt-in, borrado, retry y exportación | pruebas por paquete + E2E local |
| Library | Desktop | baseline | SQLite, cola, procesamiento, playback, exportación, watch folders e importadores | Rust integration + flujo local |
| Meetings | Desktop/Backend/Mobile | baseline | mic/system capture, transcript, notas, markers, resumen, ask y recuperación | `qa:meeting-audio` + evidencia manual |
| Dictionary y workflows | Desktop/Mobile/Backend | baseline | reemplazos, snippets, formato hablado, reglas por contexto | corpus de conformance + pruebas nuevas |
| Onboarding, licencia y updates | Desktop/Web/Backend | baseline | estados de onboarding, entitlement, descargas y actualización | pruebas de máquina + smoke de red simulado |
| Recording Assistant | Web/Mobile/Backend | baseline | threads privados, mensajes, cuotas y borrado en cascada | tests backend/web + E2E |
| Teclado iOS/Android | Mobile | baseline | App Group, IME, inserción, repositorios, notificaciones y sesión | build dev-client + dispositivo físico |
| Audio y motores | packages/Rust/Desktop/Mobile | baseline | captura, VAD, chunking, overlap, dedupe, timestamps y modelos | cargo tests + fixtures de audio |
