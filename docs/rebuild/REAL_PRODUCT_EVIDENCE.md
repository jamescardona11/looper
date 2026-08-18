# Evidencia de ejecución real

Esta evidencia corresponde a una ejecución real de la ventana Tauri de Looper,
no a un render de jsdom ni a una prueba unitaria.

## Desktop Home

Artefactos locales (ignorados por Git para no inflar la historia):

- `.tcompound/evidence/real-product/desktop-home-positive.png`
- `.tcompound/evidence/real-product/desktop-home-positive.mov`
- `.tcompound/evidence/real-product/desktop-packaged-home.png`
- `.tcompound/evidence/real-product/desktop-packaged-post-purge.png`
- `.tcompound/evidence/real-product/desktop-packaged-ac7277f.png`

La captura muestra la ventana `Looper` cargando Home, el saludo del día, el
panel `Ready to write anywhere`, navegación lateral y el campo de Memory. El
video dura aproximadamente 8 segundos y conserva la misma sesión visual.

Hashes SHA-256 de la evidencia inspeccionada:

```text
4fab2f1b15f0be42f37c72afdcbee1b4c91a75228b08469d2a7ef1bd9620b6b5  desktop-home-positive.png
4c624e58f53e15451e9a943630591a167d91b7c23dfb04704892cb95731bc591  desktop-home-positive.mov
81bb5ec2d4f8d41a8f0b03fc489ebef953be861372c266802783aab4ffa1e40a  desktop-packaged-home.png
9b0398012969b6d216791a45ebf5dc6cf29403cd15da04403a12ab361ed2a105  desktop-packaged-post-purge.png
fc28454717112c2ad54308de9cb816576d25d3d656872c92189a77950f9b3649  desktop-packaged-ac7277f.png
```

El binario empaquetado que produjo la captura fue:

- `apps/desktop/src-tauri/target/debug/bundle/macos/Looper.app`
- `apps/desktop/src-tauri/target/debug/bundle/macos/Looper.app.tar.gz`

Se construyó con `pnpm --dir apps/desktop tauri build --debug --bundles app
--no-sign`; por tanto demuestra compilación y ejecución local, no firma,
notarización ni distribución de producción.

La captura `desktop-packaged-post-purge.png` se tomó después de la limpieza
histórica de Handy/Wispr y del commit `ace168e`, usando el mismo bundle
reconstruido desde la rama activa.

La captura `desktop-packaged-ac7277f.png` se tomó después del fallback
macOS por PID del commit `ac7277f`; confirma que el bundle reconstruido abre
Home, pero no sustituye el smoke específico de inserción en TextEdit.

Ejecución Tauri de la rama AGPL actual (18 de agosto de 2026):

- Comando: `pnpm --dir apps/desktop tauri dev`
- Resultado: Vite listo en `http://localhost:8735/`, Rust compilado y proceso
  `target/debug/Looper` iniciado sin error de arranque.
- Captura: `.tcompound/evidence/runtime/looper-tauri-startup.png`
- SHA-256: `c32362517a2d8c6a24e53f150b82e38b356447f2292570c3e4ef90dc8a777538`
- Resolución: `3024x1964` (1,489,161 bytes).
- Smoke visible adicional: desde el menú nativo `Looper > Settings…` se abrió la
  ventana de Settings con la sección `Processing & Models` visible:
  `.tcompound/evidence/runtime/looper-settings-startup.png`
- SHA-256 de esa captura: `a7107fb7ef38604e4689651f08d60599798d5beeed46629e3a026c3147516f42`
- Repetición después de corregir la propagación de `key` en General Settings:
  `.tcompound/evidence/runtime/looper-settings-after-key-fix.png`
- SHA-256: `b5f247d479e8f0836386fefc3a5f68ff85f324fa64b2abe571259287702dfd43`
- En esa repetición no reaparecieron los errores React de `key`; sí permanecen
  las advertencias de entorno de Convex sin URL y de la clave cifrada de otro
  hardware descritas arriba.
- Smoke nativo de reunión después de corregir el cleanup asíncrono de listeners:
  se ejecutó `Looper > Record Meeting`, se esperaron 3 segundos, y se ejecutó
  `Looper > Stop Meeting Recording` desde el menú nativo. La sesión se inició y
  se detuvo sin el rechazo no manejado de `unregisterListener` observado en la
  ejecución anterior.
- Captura durante la sesión: `.tcompound/evidence/runtime/looper-record-meeting-after-fix-start.png`
- SHA-256: `0aa52b040b1e5adeabe762ac78db712b0d6e32c58740eaaee5d3506aef0d52c6`
- La consola aún mostró el warning de desarrollo `Couldn't find callback id`
  asociado a una recarga mientras había una operación asíncrona; no reapareció
  `Unhandled rejection` ni `unregisterListener` durante el ciclo de reunión.

Gate local de audio/reuniones ejecutado después del smoke Tauri:

- Comando: `pnpm run qa:meeting-audio`
- Resultado: `PASS` en macOS.
- Evidencia: `.tcompound/evidence/qa/meeting-audio-automated.txt`.
- El gate incluye la suite Desktop (266 archivos/915 pruebas), build del
  webview, contratos nativos Rust y la prueba acotada de captura de dos horas
  bajo presupuesto de memoria (`115.200.000` muestras, WAV de 219 MB, 0 MB de
  crecimiento RSS observado).
- Este gate sigue siendo local/automatizado: no sustituye una captura con un
  micrófono físico, permisos de macOS, dispositivo de salida ni un modelo STT
  real en ejecución.

Smoke de inserción en host macOS ejecutado el mismo día:

- Comando: `LOOPER_HOST_INSERTION_SMOKE=1 pnpm run qa:external-desktop-host`
- Resultado: `assistive::host_smoke_tests::host_insertion_smoke_in_textedit`
  pasó (`1 passed`, `0 failed`) con Accessibility/Input Monitoring disponibles.
- Evidencia: `.tcompound/evidence/release/desktop-host-insertion.json` y
  `.tcompound/evidence/release/desktop-host-insertion.txt`.
- El smoke confirma escritura en un documento TextEdit enfocado; no demuestra
  por sí solo captura de micrófono, STT real o inserción desde
  un proveedor remoto.

Smoke host-level del hotkey y Capture Pill:

- Se inició la ventana Tauri real y se emitió el hotkey macOS `Fn` mediante
  `CGEvent` (tecla virtual 63), manteniéndolo un segundo y soltándolo después.
- La captura durante la pulsación muestra el pill en `Listening…`; la captura
  posterior muestra `Ready to write anywhere`.
- Validador: `pnpm run qa:external-desktop-hotkey-pill` con evidencia real,
  resultado `pass`.
- Evidencia: `.tcompound/evidence/release/desktop-hotkey-pill-host-level.json`
  y `.tcompound/evidence/release/desktop-hotkey-pill-host-level.txt`.
- Capturas: `.tcompound/evidence/runtime/looper-hotkey-fn-held-cgevent.png`
  (SHA-256 `02ec4294c7366444b115cb4034b18f9ffe070156d5dd899466167f8ed7c700fc`)
  y `.tcompound/evidence/runtime/looper-hotkey-fn-after-cgevent.png`
  (SHA-256 `a30116ec8dd3dad75b8e7cf359ab6949076a0adcf2be8ed36895a3c330195c37`).
- Esto prueba el hotkey y la transición visual del pill; no prueba todavía
  audio hablado, STT ni la inserción de texto generada por voz.

Intento adicional de voz en host:

- TextEdit se enfocó con el texto marcador `VOICE_SMOKE_BEGIN`.
- Se mantuvo `Fn` mientras `say -v Samantha "hello from Looper voice smoke"`
  reprodujo la frase por el altavoz del Mac; luego se soltó `Fn` y se leyó de
  nuevo el documento por AppleScript.
- El proceso Tauri sí registró captura local y el motor (`mode=Local`, audio de
  `0.51s`, `long-form transcribe`), pero TextEdit conservó exactamente
  `VOICE_SMOKE_BEGIN`; no se obtuvo texto insertado.
- Captura: `.tcompound/evidence/runtime/looper-real-voice-smoke-after.png`.
- Resultado: evidencia de que el shortcut inicia captura/pipeline, pero el
  altavoz no constituye una fuente válida de voz para cerrar el gate de STT;
  micrófono físico o fixture de audio inyectado siguen pendientes.

STT local con modelo real y fixture de audio:

- Modelo usado: `parakeet_tdt_int8` INT8 instalado en el cache local de Looper
  (639 MB).
- Evidencia completa: `.tcompound/evidence/qa/local-stt-real.txt`.
- `looper-ts` pasó la prueba ignorada de paridad con `harvard.wav`,
  `es-voxforge.wav` y `pt-voxforge.wav`, incluyendo timestamps y texto dorado.
- La integración Desktop `library::meeting_live_transcription` pasó con el
  mismo modelo y `harvard.wav`; devolvió el transcript esperado en 2,42 s.
- Esto cierra inferencia local real y el wrapper Desktop con audio de fixture.
  No sustituye una captura desde un micrófono físico ni prueba proveedores
  remotos.

Durante esa ejecución el entorno informó que la clave cifrada pertenecía a
otro hardware y que `VITE_CONVEX_URL` no estaba configurado; Looper conservó
la clave cifrada y desactivó las rutas remotas/sync, pero la ventana local
abrió Home correctamente. El proceso se cerró con `Ctrl-C` después de tomar
la captura.

Validación local:

```sh
shasum -a 256 .tcompound/evidence/real-product/desktop-home-positive.*
```

## Alcance de esta evidencia

Esto prueba que el shell desktop puede abrirse y renderizar Home en el host
macOS utilizado para la reconstrucción y que el canal de inserción puede escribir
en TextEdit con los permisos nativos disponibles. También prueba el hotkey `Fn`
y la transición visible del pill. No prueba por sí solo micrófono, STT,
modelos locales, proveedores remotos, checkout,
Windows, iOS, Android ni producción.

La matriz completa de paridad mantiene esas capacidades como `pending` cuando
requieren un dispositivo, permisos o un servicio externo.
