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
| `apps/desktop/src-tauri/src/core/keyboard/macos.rs` | 97.6% | 27.3% | Secuencia de event tap, estados de modificadores y callback macOS requieren comparar comportamiento, no solo líneas. |
| `apps/desktop/src-tauri/src/core/keyboard/catalog.rs` | 100% | 4.6% | La tabla de teclas y alias conserva restricciones externas; verificar qué datos son inevitables y qué decisiones son propias. |
| `apps/desktop/src-tauri/src/music.rs` | 95.7% | 16.4% | Los scripts JXA/MediaRemote y las transiciones pause/duck siguen siendo el área más sensible. |
| `apps/desktop/src-tauri/src/platform/macos/audio_devices.rs` | 98.5% | 21.0% | Listener CoreAudio, mailbox y orden de suscripciones deben justificarse por contrato de plataforma. |
| `apps/desktop/src-tauri/src/core/keyboard/mod.rs` | 96.3% | 24.1% | Parsing de modificadores, mensajes de error y liberación de hotkeys aún requieren revisión manual. |
| `apps/desktop/src/features/settings/components/SpeechModelPanel.tsx` | 98.6% | 24.8% | Copy/IDs Lingui y transiciones de proveedor deben conservar función sin reclamar autoría independiente automática. |
| `apps/desktop/src-tauri/src/recorder.rs` | 96.3% | 17.3% | Persistencia, validación y orden del pipeline deben mantenerse bajo la licencia aplicable o reescribirse por comportamiento. |
| `apps/desktop/src-tauri/src/analytics.rs` | 97.1% | 28.8% | Clasificación de fallos, nombres de eventos y marcador de crash son decisiones creativas potencialmente derivadas. |

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
