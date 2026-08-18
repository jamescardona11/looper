# Registro de riesgo de procedencia

La auditoría de corpus mide coincidencia textual agregada. Es una señal de
revisión, no una prueba de clean-room ni una conclusión legal. Un archivo puede
quedar por debajo del umbral después de extraer helpers, cambiar nombres o
mover bloques y aun así conservar una derivación sustantiva.

## Estado del gate técnico

Auditoría ejecutada sobre la rama activa con `tools/provenance/corpus-audit.py`:

- filas con contención `>= 30%`: `0`;
- filas con repositorio bloqueante: `0`;
- máximo observado: `29.9%`.

Esto permite usar el gate como control de regresión, pero no cierra por sí solo
la revisión de los casos históricos de alto riesgo.

## Casos que requieren revisión sustantiva

| Archivo actual | Señal histórica | Estado técnico actual | Riesgo que permanece |
| --- | ---: | ---: | --- |
| `apps/desktop/src-tauri/src/core/keyboard/macos.rs` | 97.6% | 15.2% | Revisión sustantiva aplicada: la frontera nativa ahora traduce eventos a una sesión propia, el estado usa familias de modificadores y el catálogo está agrupado por función; falta validación en una ventana macOS real. |
| `apps/desktop/src-tauri/src/core/keyboard/catalog.rs` | 100% | 4.6% | Revisión de contrato completada: variantes, etiquetas y aliases son datos de interoperabilidad con eventos del sistema y se generan desde un keybook local; falta validación con códigos de teclado de cada host real. |
| `apps/desktop/src-tauri/src/music.rs` | 95.7% | 15.6% | La coordinación usa una máquina de fases propia y los programas JXA separan dispatch, identidad y volumen; falta observar pause/duck en reproductores reales. |
| `apps/desktop/src-tauri/src/platform/macos/audio_devices.rs` | 98.5% | 21.0% | Revisión de contrato completada: registro/eliminación CoreAudio, mailbox acotado, orden de suscripciones y refresh de menús están cubiertos; el smoke nativo sigue pendiente de permisos/host. |
| `apps/desktop/src-tauri/src/core/keyboard/mod.rs` | 96.3% | 24.1% | Revisión de contrato completada: el parser de modificadores usa una tabla de alias propia, el matching separa familias izquierda/derecha y el lifecycle de shutdown conserva join explícito; falta validación con hotkeys globales en un host real. |
| `apps/desktop/src/features/settings/components/SpeechModelPanel.tsx` | 98.6% | 24.8% | Revisión funcional completada: provider/model discovery, reset de presets, API key, callbacks y copy Lingui viven en contratos propios; la equivalencia visual por píxel aún no está demostrada. |
| `apps/desktop/src-tauri/src/recorder.rs` | 96.3% | 17.3% | Revisión sustantiva completada: captura, journal parcial, procesamiento, validación, archivo y recovery están separados en límites propios; faltan micrófono, permisos y acústica reales. |
| `apps/desktop/src-tauri/src/analytics.rs` | 97.1% | 28.8% | Revisión sustantiva completada: consentimiento, eventos, excepciones, clasificación y markers están encapsulados en políticas propias; nombres de eventos y categorías siguen siendo contratos observables y no se validó envío PostHog real. |

## Casos móviles

La misma auditoría incluye `apps/mobile` y no encontró filas sobre el umbral
técnico (`86` archivos auditables, máximo actual `27.7%`). Aun así, estos son
los casos que requieren revisión sustantiva por su referencia principal:

| Archivo actual | Señal actual | Referencia principal | Riesgo que permanece |
| --- | ---: | --- | --- |
| `apps/mobile/targets/keyboard/KeyboardViewController.swift` | 27.7% | Voquill (AGPLv3) | Flujo de teclado, permisos, ciclo de captura e inserción deben verificarse en una extensión real. |
| `apps/mobile/targets/_shared/DarwinNotificationManager.swift` | 23.7% | Voquill (AGPLv3) | Notificaciones Darwin y coordinación entre procesos requieren validar el contrato nativo. |
| `apps/mobile/targets/widgets/MeetingLiveActivity.swift` | 23.1% | Voquill (AGPLv3) | Estado y lifecycle de Live Activity requieren validación en dispositivo. |
| `apps/mobile/targets/keyboard/Repos/MemberRepo.swift` | 22.9% | Voquill (AGPLv3) | Persistencia de identidad/trial y wire de Convex requieren revisar paridad y atribución. |
| `apps/mobile/targets/keyboard/Types/SharedWorkflow.swift` | 11.8% | typewhisper-mac (GPL) | El contrato de workflows debe conservar el aviso y la licencia aplicable. |

## Regla de remediación

Cambiar nombres, mover archivos o eliminar tests no se considera por sí mismo
una reimplementación. Para cada caso abierto solo hay dos vías defendibles:

1. conservar el código bajo GNU AGPL-3.0-or-later, con sus avisos y atribución
   correspondientes; o
2. hacer una reimplementación sustantiva basada en contratos observables,
   escribir pruebas nuevas y documentar qué decisiones de diseño cambiaron.

No se debe presentar el resultado como clean-room únicamente porque el porcentaje
de coincidencia textual bajó. La revisión legal externa sigue siendo necesaria
antes de redistribuir.

## Elementos retirados

Los módulos de producto `import/handy.rs` y `import/wispr.rs` no existen en el
árbol reconstruido. La mención de `Handy` en el script de auditoría solo identifica
un repositorio de referencia del corpus y no es una dependencia del producto.

## Revisión sustantiva registrada

El 18 de agosto de 2026 se revisó `core/keyboard/macos.rs` contra el contrato
observable de `KeyboardListener`: permisos de Accesibilidad, creación y
reactivación del event tap, traducción de teclas/punteros, Caps Lock, lados de
modificadores, autorepeat, bloqueo/forwarding y liberación. La implementación
actual separa `NativeEvent`, `TapSession` y `KeyboardState`; no se eliminaron
pruebas para reducir la señal. Se añadieron contratos unitarios para la
traducción de sesión y la recuperación de un tap deshabilitado. Verificación:
14 pruebas de teclado, `cargo check --all-targets`, suite Rust completa,
`qa:desktop-native`, `pnpm verify` y auditoría de corpus; la última evidencia
no prueba interacción nativa con una ventana macOS ni permisos del sistema.

En la misma fecha se revisó `music.rs` contra el contrato de `PillController`:
sesiones no nulas, pause/duck, carreras de sesiones superpuestas, reanudación
solo del reproductor pausado por Looper, cancelación y restauración de volumen.
La implementación actual usa `SessionPhase` para distinguir estado inactivo y
activo, conserva el token público y reescribe los dispatchers JXA con rutas de
comando explícitas. La sintaxis de ambos programas JXA se validó con
`osascript`; los contratos Rust de lifecycle/wire pasaron y no se eliminaron
tests para reducir la señal. No se ejecutó Spotify/Apple Music ni se cambió el
volumen real del host.

También se revisó `platform/macos/audio_devices.rs` contra el contrato del
watcher de entrada: ambos selectores CoreAudio, coalescencia en un canal de
capacidad uno, actualización de menú/tray, emisión al renderer y eliminación
RAII de listeners. Las pruebas cubren la dirección de propiedad, el callback
con contexto nulo y la coalescencia; el smoke que registra listeners reales se
mantiene explícitamente ignorado porque requiere CoreAudio y permisos del host.

Finalmente se revisó `core/keyboard/mod.rs` contra el contrato observable de
hotkeys: aliases y parseo de modificadores, representación de lados, matching
genérico/específico, shortcuts de solo modificador, forwarding de teclas no
registradas, eventos de liberación y parada ordenada del worker. La
implementación actual separa `ModifierGroup`, `EventPolicy` y
`PlatformShutdown`, conserva los mensajes de error y no elimina tests para
reducir la señal. Las pruebas focales cubren la tabla de verdad, aliases,
forwarding y ambos bordes de un modificador; la evidencia no incluye una
ventana macOS/Windows real ni una hotkey global disparada por dispositivo.

El catálogo `core/keyboard/catalog.rs` se revisó por separado porque su
señal histórica correspondía a una tabla completa de claves. Las etiquetas,
variantes y aliases son parte del protocolo observable entre el parser de
shortcuts y los códigos nativos; cambiarlos por nombres inventados rompería
configuraciones existentes. La implementación actual usa un `keybook` local
que genera el enum y sus metadatos, encapsula la búsqueda en `KeyEntry` y
mantiene el error público `Unknown key`. Las pruebas cubren round-trip de
todas las etiquetas, aliases de puntuación, mouse y keypad; no se eliminaron
tests para bajar la señal. Falta todavía una prueba de dispositivo para cada
layout físico de teclado.

`SpeechModelPanel.tsx` se revisó contra el contrato observable de Settings:
selección de proveedor, endpoint custom, presets, modelo automático, modelos
descubiertos y faltantes, API key, capability de discovery, callbacks y todos
los IDs de traducción. El entrypoint actual prepara datos y copy, y delega el
render en `ProviderConfigurationPanel`; las pruebas focales cubren cambio de
provider, preservación de API key, normalización de modelos, modelo faltante,
discovery condicional y nombres accesibles localizados. No se eliminaron
tests. El gate no prueba renderizado pixel-perfect, GPU ni interacción con un
backend/proveedor remoto real.

`recorder.rs` se revisó contra el contrato observable de captura: worker de
CPAL, armado por señal, espectro de 512 muestras, lectura incremental de audio,
journal parcial con cierre/descartado, downmix, resample, VAD, validación,
archivo WAV canónico y recuperación de parciales. La implementación actual
separa `RecorderState`, `CaptureWorker`, `PartialJournal`, `AudioProcessor`,
`RecordingValidator`, `RecordingArchive` y `RecoveryScan`; conserva las APIs
públicas, el orden stop→journal→hook→procesado y los errores existentes. Las
pruebas cubren 15 contratos deterministas, incluyendo persistencia temporal,
recovery, downmix, límites de señal y WAV. No se eliminaron tests. No se
afirma evidencia de CPAL, permisos de micrófono, dispositivo, acústica o VAD
en vivo.

`analytics.rs` se revisó contra el contrato observable de telemetría y
diagnóstico local: identidad anónima, consentimiento opt-in/final opt-out,
orden de eventos de settings, payloads acotados, excepciones, clasificación de
fallos/pánicos y parsing de markers de crash. La implementación actual separa
`AnalyticsConfig`, `AnalyticsIdentity`, `EventDraft`, `ExceptionDraft`,
`TelemetryRoute`, tablas de reglas y `CrashMarker`; conserva los nombres de
eventos, campos públicos, fase monotónica y ausencia de transcript/audio en
payloads. Las pruebas focales cubren 13 contratos, incluyendo anonimización,
precedencia de categorías, wire de crash y límites de propiedades. No se
eliminaron tests. No se ejecutó un envío real a PostHog ni una producción
Tauri, por lo que esa parte permanece sin evidencia externa.
