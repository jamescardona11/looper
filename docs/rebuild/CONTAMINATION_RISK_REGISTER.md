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
| `apps/desktop/src-tauri/src/core/keyboard/catalog.rs` | 100% | 4.6% | La tabla de teclas y alias conserva restricciones externas; verificar qué datos son inevitables y qué decisiones son propias. |
| `apps/desktop/src-tauri/src/music.rs` | 95.7% | 15.6% | La coordinación usa una máquina de fases propia y los programas JXA separan dispatch, identidad y volumen; falta observar pause/duck en reproductores reales. |
| `apps/desktop/src-tauri/src/platform/macos/audio_devices.rs` | 98.5% | 21.0% | Revisión de contrato completada: registro/eliminación CoreAudio, mailbox acotado, orden de suscripciones y refresh de menús están cubiertos; el smoke nativo sigue pendiente de permisos/host. |
| `apps/desktop/src-tauri/src/core/keyboard/mod.rs` | 96.3% | 24.1% | Revisión de contrato completada: el parser de modificadores usa una tabla de alias propia, el matching separa familias izquierda/derecha y el lifecycle de shutdown conserva join explícito; falta validación con hotkeys globales en un host real. |
| `apps/desktop/src/features/settings/components/SpeechModelPanel.tsx` | 98.6% | 24.8% | Copy/IDs Lingui y transiciones de proveedor deben conservar función sin reclamar autoría independiente automática. |
| `apps/desktop/src-tauri/src/recorder.rs` | 96.3% | 17.3% | Persistencia, validación y orden del pipeline deben mantenerse bajo la licencia aplicable o reescribirse por comportamiento. |
| `apps/desktop/src-tauri/src/analytics.rs` | 97.1% | 28.8% | Clasificación de fallos, nombres de eventos y marcador de crash son decisiones creativas potencialmente derivadas. |

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
