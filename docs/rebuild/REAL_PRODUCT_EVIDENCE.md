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

Smoke real de Settings, permisos y modelos del bundle actual (18 de agosto de
2026):

- Se reconstruyó y abrió el bundle de este checkout en
  `apps/desktop/src-tauri/target/debug/bundle/macos/Looper.app` con
  `pnpm tauri build --debug --bundles app --no-sign --ci`.
- Desde `Settings` se abrió `Privacy & Permissions` en la ventana Tauri real.
  La app reconoció `Microphone` como `Enabled`; `Accessibility` e `Input
  Monitoring` permanecieron `off`.
- Los tres botones `Open Settings` abrieron las páginas nativas reales de
  macOS. Microphone y Accessibility mostraron la fila `Looper.app` habilitada.
  Input Monitoring abrió la página correcta, pero no mostró una fila Looper;
  no se cambió esa autorización de seguridad.
- El switch de captura/overlay se activó y desactivó nuevamente desde la UI
  real, verificando un cambio reversible sin dejar una mutación de producto.
- `Processing & Models` mostró el catálogo instalado (Parakeet TDT V3 y
  Cohere) y el modelo activo sin modificar la selección.
- Verificación adicional en `Settings → Providers` sobre el bundle real: se
  confirmó `Meeting intelligence` en `Local` con `Qwen 3.5 4B` listo, speech
  remoto y writing provider inicialmente apagados; el switch de speech remoto
  se activó y volvió a apagarse de forma reversible. Al activarlo sin una clave,
  la app mostró el error observable `Remote speech API key cannot be empty`,
  luego el aviso desapareció tras unos segundos y el switch quedó apagado.
  Evidencia: `.argent/recordings/macos-providers-real-current.jpeg` (SHA-256
  `895edc1beacca2c8a4eb4e819ed6457d227f6a49232cf752a174dee0b06829bd`) y
  `.argent/recordings/macos-provider-empty-key-error-real.jpeg` (SHA-256
  `7238c50e3a5cc3649a5a49177d9106b20d80fc84c5515fad86c561709c5f34aa`). No se
  introdujo ni se guardó ninguna clave.
- Evidencia y hashes SHA-256:

  ```text
  017a1e16ec76021a61bba190d5bb0d20ae7fec1a60f6269258631dcfb5cc2130  macos-microphone-settings.png
  e2de5b0945806cc4f71d37674c31f91085ecbe11da31cf66e7f0ac5a8ec1e7f3  macos-accessibility-settings.png
  d628f72bc7e97e67a15e26198f04664f0c66d1c78f117480f709dc0eca930b59  macos-input-monitoring-settings.png
  9a7532d2715ddc1760238b3d02d02326e879445efe1eec8434a0c10deb229215  macos-looper-privacy-settings.png
  bf46c942d132fb185c796239df67b06d1f8fb6c7773b68444292180dc7763989  macos-looper-models-settings.png
  ```

- Verificación adicional de Memory en la ventana macOS real: la vista cargó
  resultados persistidos de meetings, recordings y dictations; al introducir
  `harvard` en `Search Memory` filtró los resultados y mostró el recording
  `harvard` junto con las coincidencias de contenido. El campo se limpió al
  terminar, sin modificar registros. Evidencia:
  `.argent/recordings/macos-memory-search-harvard-real.jpeg` (SHA-256
  `cac43de9686694132acecdbfc2d3c6254f73acbaf8d20bb4196a15d83f268513`).

- Desde Memory se abrió un meeting persistido en la ventana macOS real; se
  cerró el diálogo de YouTube que estaba abierto, se abrió la pestaña
  `Transcript` y se observaron dos segmentos con timestamps `0:00` y `0:02`,
  además de `Copy`, `Export`, `More actions`, el resumen `Enhanced` y el
  control `Play`. La búsqueda de transcript `Francia` mostró `1/1` y luego
  se limpió, sin modificar el meeting. Evidencia:
  `.argent/recordings/macos-meeting-transcript-real.jpeg` (SHA-256
  `9596697db50a3c8c51c3484d6bf4e348879fd5e983544351f43f736d22b62841`).

- En una ejecución nueva sobre ese meeting en la ventana macOS real se pulsó
  `Copy` y la UI cambió a `Copied`; evidencia:
  `.argent/recordings/macos-meeting-transcript-copied-real.jpeg` (SHA-256
  `ce3807e0d58320db43e5053b854dbbb9243276abb79d9319e2cccbddeafb63e3`).
  Después se abrió `Export`, se seleccionó `TXT` y apareció el diálogo nativo
  `Save` con el nombre `Meeting 2026-08-18 16-30.txt`. El archivo se guardó en
  `/Users/zoro/Documents/Meeting 2026-08-18 16-30.txt` y se verificó fuera de
  la UI: SHA-256 `4791a243eafc4b6f1c6e48d8b9b1f9dce095a6e8ffd01a4d65411488be4a8bd8`,
  título/fecha y los dos segmentos esperados. Esto prueba copiar y exportar
  TXT desde la UI real hasta el archivo nativo, no solo el comando CLI.

Esta evidencia cubre la navegación, el estado renderizado y los deep links de
permisos del producto actual. No equivale a conceder Input Monitoring ni a
probar una inserción en un dispositivo físico; esa autorización se mantiene
pendiente por seguridad y por el estado real del host.
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

Smoke de reunión por el canal IPC de la app Tauri (18 de agosto de 2026):

- Contra el socket real `/tmp/looper-cli-zoro-comj11looperdesktop.sock` se
  ejecutó `meeting.start` con micrófono solamente, se consultó `meeting.status`
  después de 3 segundos y se ejecutó `meeting.stop`.
- Resultado: `phase=recording`, `audio_lag_ms=0`, `status=healthy`,
  `elapsed_seconds=3`, y cierre final `phase=idle` sin error.
- Evidencia: `.tcompound/evidence/real-product/macos-cli-meeting-cycle.txt`.
- El ciclo demuestra el runtime nativo y el control de grabación; el host no
  aportó voz, por lo que no se presenta como prueba de STT con micrófono físico.

Smoke actual de inserción global en TextEdit (18 de agosto de 2026):

- Se ejecutó `LOOPER_HOST_INSERTION_SMOKE=1 pnpm run qa:external-desktop-host`
  contra la rama `main` en este checkout. El gate creó un documento temporal de
  TextEdit, insertó texto mediante la ruta nativa de Accessibility/Input
  Monitoring, verificó el contenido y ejecutó undo/limpieza.
- Resultado: `1 passed`, `0 failed`; evidencia JSON/TXT en
  `.tcompound/evidence/release/desktop-host-insertion.{json,txt}`.
- Una primera ejecución falló porque TextEdit no tenía foco (`AXGroup` vacío).
  Después de activar TextEdit y repetir sin cambiar código, el gate pasó; se
  conserva el primer diagnóstico en la evidencia reemplazada por la corrida
  final para no confundirlo con el resultado vigente.

Smoke de importación y STT local por el CLI conectado a la app Tauri:

- Se ejecutó `/tmp/looper-cli library import test-support/fixtures/audio/harvard.wav
  --wait --json`, usando el binario del checkout y el socket del proceso Tauri
  activo.
- Resultado: el item `616ed669-9128-4975-b3b2-21dae97c7337` terminó en
  `status=complete`, `progress=1.0`, con `speech_model=parakeet_tdt_int8` y
  transcript completo del fixture Harvard.
- `library status` y `library list` posteriores devolvieron el mismo registro
  desde la base persistente; la evidencia está en
  `.tcompound/evidence/real-product/macos-cli-library-import.txt`.
- Esto demuestra importación, cola, inferencia local y persistencia reales del
  desktop; no equivale a captura de micrófono físico ni a un proveedor remoto.

Smoke acústico de micrófono real del host:

- Se verificó que macOS reconocía `MacBook Pro Microphone` y que una captura de
  4 segundos entregaba PCM no silencioso (`rms=104.26`, `peak=1330`).
- Se cambió temporalmente la salida a `MacBook Pro Speakers` y la entrada a
  `MacBook Pro Microphone`; se restauraron ambos dispositivos a `James’s AirPods
  Pro` al terminar.
- Mientras la app Tauri real estaba en `meeting.start --mic-only`, `say` emitió
  por los altavoces la frase de prueba. El audio pasó por el micrófono, la app
  terminó el meeting y Parakeet produjo:
  `Loop a Real Microphone Smoke Test, the desktop application is listening to the
  MacBook microphone.`
- El item `a80015bc-b94c-4143-8a50-9f002853a0d5` quedó persistido con
  `status=complete`, `progress=1.0`, `duration_seconds=15.4` y el transcript
  anterior. Evidencia: archivos `macos-real-mic-*` en
  `.tcompound/evidence/real-product/`.
- Es una prueba de micrófono, captura, inferencia y persistencia reales usando
  audio acústico sintetizado; no la presento como conversación humana ni como
  validación de proveedor remoto.

Smoke adicional del CLI real:

- `model list --json` confirmó dos modelos locales instalados y dejó activo
  `parakeet_tdt_int8`.
- `transcribe test-support/fixtures/audio/harvard.wav --stdout --no-cleanup
  --json` ejecutó el motor local del binario Looper y devolvió el transcript
  completo, 43 palabras y `speech_model=Parakeet TDT V3`.
- Evidencia: `macos-cli-model-list.json` y `macos-cli-transcribe.json`.
- También se ejecutó un ciclo reversible real de diccionario y reemplazos
  (`add → list → remove → list`); ambos terminaron vacíos como al inicio.
  Los JSON están en los artefactos `dictionary-*` y `replacement-*`.

Smoke de exportación desde la base viva del desktop:

- `library export` generó `/tmp/looper-real-harvard.txt` para el item recién
  transcrito; el archivo contiene el título, la fecha y el transcript esperado.
- `history export` generó un ZIP real con `17` dictados, `60` items de Library,
  `58` reuniones y sus transcripciones/audio; el archivo se validó con `unzip
  -l` sin escribir en la base de datos.
- Evidencia conservada: `.tcompound/evidence/real-product/macos-cli-library-export.json`,
  `.tcompound/evidence/real-product/macos-cli-harvard.txt` y
  `.tcompound/evidence/real-product/macos-cli-history-export.json`.
- Esto prueba la salida de transcript y el empaquetado de historial contra
  datos reales; no prueba apertura automática del archivo ni importación del
  ZIP en otra instalación.

Exploración adicional de la UI real del bundle actual:

- Navegación Home → Meetings → Memory → Voice completada mediante la ventana
  Tauri empaquetada, sin errores de render ni cierre del proceso.
- Meetings: el filtro `Ready` redujo la lista a elementos listos y se restauró
  después a `off`; la búsqueda de Memory con `pickle` mostró coincidencias y
  resaltó el término dentro del resultado.
- Voice: se agregó y eliminó una palabra temporal (`LooperTempWord`) y se
  agregó y eliminó un reemplazo temporal (`looper-temp → Looper`). La vista
  volvió a `0` entradas y `0` reemplazos, sin dejar datos de prueba.
- Import: el botón de la UI abrió el selector nativo `Open` de macOS y
  `Cancel` lo cerró sin importar archivos ni cambiar la base.
- YouTube: la UI abrió el modal real; una URL inválida habilitó `Review`, la
  revisión terminó sin crear un registro y la vista volvió a Meetings.
- Después de todos los escenarios, `/tmp/looper-cli status --json` confirmó
  `app_running=true`, `pill=idle`, `remote_enabled=false` y el modelo local
  `parakeet_tdt_int8` activo.
- La verificación posterior por CLI devolvió `{"words":[]}` y
  `{"replacements":[]}`, confirmando que los datos temporales se limpiaron
  también en la persistencia real.
- Capturas de esta exploración: `real-product-evidence/macos-meetings-ui-real.jpeg`
  (SHA-256 `507680655af18f189494f136b6618080deb8ed143069cfcb87855a57539d28cd`)
  y `real-product-evidence/macos-voice-ui-real.jpeg` (SHA-256
  `02c2fd4e22ca8b312cd64294f51e3c90f1d44815e5168741e409155028118a82`).

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

Gate nativo local repetido (18 de agosto de 2026):

- `pnpm run qa:desktop-native` pasó contra el checkout actual: 792 pruebas Rust
  ejecutadas; las pruebas que requieren permisos o hardware quedaron marcadas
  como ignoradas explícitamente.
- Evidencia completa: `.tcompound/evidence/qa/desktop-native-local-gate.txt`.
- Este gate valida contratos nativos y compilación local; no sustituye una
  prueba de micrófono humano, un dispositivo Windows ni un proveedor remoto.

Smoke de inserción en host macOS:

- Una ejecución histórica del comando
  `LOOPER_HOST_INSERTION_SMOKE=1 pnpm run qa:external-desktop-host` pasó
  (`1 passed`, `0 failed`) con Accessibility/Input Monitoring disponibles.
- Hubo dos intentos intermedios con foco perdido (`AXGroup` vacío); se corrigió
  activando TextEdit y repitiendo sin cambiar el código del producto.
- La corrida vigente del 18 de agosto de 2026 terminó `1 passed`, `0 failed`.
  Evidencia final: `.tcompound/evidence/release/desktop-host-insertion.json`
  y `.tcompound/evidence/release/desktop-host-insertion.txt`.
- Esto confirma inserción/undo con Accessibility/Input Monitoring; no demuestra
  por sí sola captura de micrófono, STT real o inserción desde un proveedor
  remoto.

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
- Se repitió el intento reproduciendo `test-support/fixtures/audio/harvard.wav`
  con `afplay` mientras `Fn` estaba sostenido y TextEdit tenía
  `FIXTURE_SMOKE_BEGIN`. El documento permaneció sin cambios; Tauri registró
  `mode=Local`, pero solo `0.51s` de audio útil. La reproducción por altavoz no
  es una inyección de audio válida para este micrófono y no se cuenta como
  prueba de dictado end-to-end.

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

Emparejamiento de dictado remoto entre clientes:

- `pnpm run qa:remote-dictation-local` pasó con dos clientes Convex reales
  contra `http://127.0.0.1:3210`: el cliente móvil descubrió la sesión desktop,
  consumió la secuencia `1` y el handoff terminó correctamente.
- Evidencia: `.tcompound/evidence/qa/remote-dictation-cross-client-pairing.txt`.
- Este gate prueba identidad/emparejamiento y handoff local; no prueba que una
  ventana Tauri inserte texto en un campo macOS ni que un proveedor STT remoto
  procese audio.

Smoke HTTP completo del backend Convex local:

- Con el backend local activo en `http://127.0.0.1:3210`, se ejecutó
  `CONVEX_URL=http://127.0.0.1:3210 CONVEX_FULL_PROVIDER_SMOKE=0 pnpm run qa:convex-full`.
- Resultado: `24` comprobaciones pasaron, `1` quedó omitida explícitamente y no
  hubo fallos. Se cubrieron autenticación anónima, usuario, mock mode,
  waitlist, feedback, diccionario, reemplazos, snippets, settings, pairing
  remoto, transcripciones, onboarding, Recording Assistant, uso/créditos,
  pagos/consulta, exportación de cuenta, upload de audio, configuración STT,
  actividad de audio, user keys y lecturas administrativas seguras.
- Evidencia: `.tcompound/evidence/qa/convex-full-http-smoke.txt` y
  `.tcompound/evidence/qa/convex-full-http-smoke.json`.
- `CONVEX_FULL_PROVIDER_SMOKE=0` fue intencional: el gate valida el backend
  local y no realiza llamadas de pago a Deepgram, AssemblyAI, ElevenLabs u
  OpenAI. Por tanto no convierte esta ejecución en prueba de STT remoto real.

## Mobile real (iOS Simulator y Android Emulator)

Se ejecutó el build de desarrollo de `apps/mobile` conectado a Metro contra la
app instalada, no contra una vista simulada:

- Android Emulator `emulator-5554`: se abrió Library, se confirmó la nota
  persistida después de relanzar la app, se abrió `Dictar una idea`, se inició y
  detuvo una captura real del emulador y se esperó el resultado del pipeline.
  El resultado honesto fue `No se detectó voz en la grabación`; la captura está
  en `.tcompound/evidence/real-product/android-dictation-idea-no-voice-current.png`.
  Esto prueba la ruta de captura y su estado vacío, no voz humana ni STT con
  micrófono físico.
- En el mismo emulador se abrió `Empezar meeting`, se observó la pantalla real
  `Grabando/Listening`, se regresó a Library y se abrió el meeting persistido;
  quedó guardado con `0:00` y `0 segmentos` por la entrada silenciosa del
  emulador. Evidencia: `android-meeting-running-current.png` y
  `android-meeting-detail-current.png`.
- También se ejecutó la importación real desde el selector Android: se abrió
  `Importar contenido`, `Elegir archivo`, DocumentsUI, se seleccionó
  `looper-readme.md`, se pulsó `Importar selección` y la app mostró
  `Importación terminada`; `Abrir Library` mostró el item recién importado.
  Evidencia: `android-file-picker-current.png`,
  `android-import-readme-result-current.png`,
  `android-import-readme-complete-current.png` y
  `android-library-after-import-current.png`.
  El WAV auxiliar que se usó para inspeccionar el filtro del selector se eliminó
  del emulador al finalizar; el item importado provenía del Markdown compatible.
- La nota persistida se verificó tras `force-stop` y relanzamiento; evidencia:
  `.tcompound/evidence/real-product/android-note-relaunch-after-wait.png`.
- Reejecución diagnóstica del 18 de agosto de 2026: se reinició Convex local y
  Metro desde `apps/mobile` con `--clear`, se dejó `adb reverse tcp:8081` y se
  verificó que el manifiesto apuntaba al proyecto correcto
  (`/Users/zoro/j11/looper/apps/mobile`) y que el bundle contenía las rutas de
  Looper (`Library`, `Capture`, `Ask`, `Studio`). Aun así, el Dev Client del
  emulador mostró el tutorial interno de Expo (`Welcome to Expo`) o su pantalla
  de servidores, y no montó la navegación de Looper. Evidencia:
  `docs/rebuild/real-product-evidence/android-main-relaunch.png`,
  `android-bundle-launch.png` y `android-final-relaunch.png`. El log confirma
  `Running "main"` y conexión a Metro, pero no una pantalla funcional de
  Looper; esta reejecución queda como bloqueo reproducible del runtime
  Dev Client/Expo Router, no como un nuevo pase de producto.
- Se construyó además un APK release standalone desde `apps/mobile/android` y
  se instaló en `emulator-5554` fuera de Dev Client. La primera ejecución mostró
  la pantalla propia de Looper (`Falta conectar Looper`), confirmando que el
  binario cargaba el bundle/rutas de Looper y no el tutorial de Expo. Después
  se forzó la tarea de bundle con `EXPO_PUBLIC_CONVEX_URL` y se ejecutó otra
  vez contra el endpoint HTTPS configurado por el proyecto. La app llegó a
  autenticación y montó `Library`, pero el backend respondió un error de
  servidor en `notes:list`; el proceso React Native terminó y Android mostró
  el flujo de error del sistema. Evidencia: `docs/rebuild/real-product-evidence/
  android-release-home.png`, `android-release-cloud-home.png`; log de la
  segunda ejecución: `CONVEX Q(notes/notes:list) ... Server Error`. La variante
  local `http://10.0.2.2:3210` llegó a la conexión pero fue rechazada por la
  política de cleartext del release; no se cambió esa política del producto.
- Después se repitió el mismo APK release standalone contra Convex local
  (`10.0.2.2:3210`) con un permiso `usesCleartextTraffic` habilitado únicamente
  en el manifiesto generado de prueba; ese manifiesto fue limpiado al terminar
  y no pertenece al código versionado. Esta pasada sí montó el producto real y
  verificó, en `emulator-5554`, Library, edición/persistencia de una nota,
  DocumentsUI → selección de `looper-readme.md` → preview → `Importar selección`
  → `Importación terminada` → `Abrir Library`, y los cuatro destinos inferiores.
  Evidencia nueva: `docs/rebuild/real-product-evidence/
  android-release-local-cleartext.png`, `android-note-edit-real.png`,
  `android-note-persisted-real.png`, `android-document-picker-real.png`,
  `android-import-preview-real.png`, `android-import-complete-real.png` y
  `android-imported-library-real.png`.
- Repetición interactiva del 18 de agosto de 2026 en el Android Emulator
  `emulator-5554`: desde la app real se creó una nota temporal (`QA Android`),
  se escribió cuerpo, se confirmó el estado `Guardado`, se abrió el diálogo
  nativo `Eliminar nota` y se confirmó `ELIMINAR`. La nota temporal desapareció
  de Library; la única nota que quedó visible era `Untitled note`, preexistente
  en el emulador. Evidencia: `android-note-delete-dialog-current.png` y
  `android-note-after-cleanup-current.png` (SHA-256
  `083f29add0f8eb3ad1a804029c745fa0d620e2b083e830c5a14559a0a0225e85` y
  `b1663ea74b72d8289eb2b3b26604d2edc00235667e45e38e64c53259a2b5c85`).
- En esa misma ejecución se abrió Meeting, se llegó a la pantalla de captura y
  se observó el estado `Listening`; el emulador entrega silencio, por lo que el
  resultado guardado fue `0:00`/`0 segmentos` y no se afirma reconocimiento de voz.
  Dictar también llegó al estado `Listening` con el micrófono del emulador y
  dejó registros al salir del flujo. Evidencia: `android-meeting-running-real.png`,
  `android-meeting-active-detail-real.png`, `android-dictation-real.png`,
  `android-dictation-listening-real.png` y `android-final-launch-real.png`.
- Exploración nueva del destino `Ask Looper` en el Android Emulator: la app
  real cargó los filtros de Library y el campo `Pregunta para Looper`, pero al
  no existir una clave para el modelo configurado mostró el error observable
  `No API key available for the configured model...`. No se presenta como una
  respuesta exitosa del asistente ni se añadió ninguna credencial. Evidencia:
  `.argent/recordings/android-ask-no-api-key-live.png` (SHA-256
  `5555964159ca8f13be01cc1ce53713b9d1cae88697cfe441cf5e63db50394f0d`).
- Desde una sesión real de Library se abrió `Ask`, se seleccionó la pregunta
  sugerida `¿Qué decisiones tomamos esta semana?` y la pantalla devolvió el
  error explícito `No API key available for the configured model`. Esto verifica
  la superficie Ask y el estado de configuración faltante, pero no una respuesta
  LLM exitosa. Evidencia: `android-ask-no-api-key-current.png` (SHA-256
  `ca1d1319b9303e74190e394d32376282453ddbb994bf0ac6ca746208cc88ad`).
- Desde la app real se abrió `Studio`, se cambió el estilo de `Claro y breve` a
  `Cálido` y la vista mostró la previsualización nueva junto con `Guardado. El
  teclado se actualiza automáticamente.`. Evidencia:
  `android-studio-style-saved-current.png` (SHA-256
  `ed900d9eff50fda97be9aa3a974e06efd3c7698c0f6cb29d4b8e9749aff5778b`).
- También se abrió `Studio → Smart Modes` en la app real. La superficie cargó
  correctamente el estado vacío `Aún no hay Smart Modes` y el botón
  `Crear Smart Mode`; el formulario se abrió con estilo, formato,
  instrucciones y guardar visibles. Se canceló sin guardar datos de prueba.
  Evidencia del estado vacío: `android-studio-smart-modes-empty-current.png`
  (SHA-256
  `0bbaa22ffa38d4cd2e27a41db2824ca25cdfb0450faf54f11e38560e80642119`).
- En una repetición posterior se creó y guardó desde la app real el Smart Mode
  `QA Android Smart Mode`, con estilo `Cálido` y formato `bullets`. La fila quedó
  visible en `Studio → Smart Modes` y mostró `Guardado. El teclado se actualiza
  automáticamente.`. Evidencia: `android-studio-smart-mode-saved-current.png`
  (SHA-256
  `fd85d03edfac9c67670304b34777c119e3b3ab53222fb3cdb5e0571696f6c090`).
- iOS Simulator `iPhone 17 Pro` (`65D84596-1455-4E1E-A4F6-3DCD0CFB9686`): la
  app abrió Library, reabrió una nota guardada, mostró Importar contenido, Ask,
  Capture/Meeting y Studio. Además se pulsó `Empezar meeting` mediante el
  objetivo semántico expuesto, se observó la pantalla de Meeting y se volvió a
  Library mediante `Volver a Library`. Evidencia visual: los artefactos con prefijo
  `ios-` en `.tcompound/evidence/real-product/`.
- En una repetición real se creó la nota `Real QA iOS note` desde la UI de iOS,
  se confirmó su aparición en Library, se detuvo y relanzó la app, y se volvió a
  observar la nota persistida. Evidencia: `ios-real-note-created-current.jpg` y
  `ios-note-persisted-after-relaunch-current.jpg`.
- La importación de archivo llegó a la superficie y mostró `Elegir archivo`.
  Después de añadir el rol de botón al control, el snapshot semántico lo expuso
  como target accionable y el toque abrió el Document Picker real de iOS en
  `Recents`/`No Recents`; evidencia: `ios-import-button-accessible-current.jpg`
  y `ios-document-picker-open-current.jpg`. El picker se cerró con Escape y la
  app quedó nuevamente en la pantalla de importación.
- Se intentó completar la selección con un archivo descargado desde Safari. El
  archivo no apareció en `Recents` ni en el proveedor `On My iPhone` del
  simulador; una búsqueda semántica por `looper-import.md` tampoco devolvió
  resultados. La hoja de compartir no expuso un destino semántico de “Guardar
  en Archivos”. Por eso la selección y aplicación de un archivo iOS quedan
  explícitamente sin evidencia E2E. Evidencia negativa:
  `docs/rebuild/real-product-evidence/ios-files-search-no-import-current.jpg`.
  La app se dejó de nuevo en Library y su estado de desarrollo quedó operativo;
  evidencia: `docs/rebuild/real-product-evidence/ios-final-library-current.jpg`.
- Reintento adicional del 18 de agosto de 2026: se sirvió un Markdown real por
  HTTP local con `Content-Disposition: attachment`; Safari mostró y confirmó el
  diálogo `Do you want to download “looper-ios-import.md”?`. El archivo quedó
  en la lista interna de Downloads de Safari, pero el Document Picker de Looper
  siguió mostrando `Recents` vacío, `Shared` vacío y `On My iPhone is Empty`.
  Se canceló el picker y la app volvió a `Importar` sin cambios. Esto refuerza
  el límite de entorno, pero no es un pase de importación positiva. Evidencia:
  `ios-download-prompt-current.png`, `ios-picker-recents-empty-current.png` y
  `ios-import-screen-after-cancel-current.png` (SHA-256
  `1344618e65564f90e63745657fea476dc87ae91a0ab971bad149f1b87cf9aeaf`,
  `22c51985baf3c67207eee6d3851f05ece1634a91fdeb0772fd70170d4907c67a` y
  `d6e996951cdf3e354a0240ed43e0b41d1f72a6e7aa12bf8bd1d98f7a26f03ebd`).
- Repetición standalone con `Looper.xcworkspace`, scheme `Looper`, configuración
  `Release` y `EXPO_PUBLIC_CONVEX_URL=http://127.0.0.1:3210`: el build de Xcode
  terminó con `BUILD SUCCEEDED` y el bundle arrancó directamente en la pantalla
  real de Library. Se creó una nota, se editó título/cuerpo y se confirmó su
  persistencia al reiniciar la app. Evidencia nueva: `ios-release-local-library.png`,
  `ios-release-note-edit-real.png` y la entrada `Nota: IOSiOS Release Note` en
  Library después del relanzamiento.
- Repetición adicional en el mismo simulador: se relanzó la app desde un editor
  real y Library volvió a mostrar `Nota: IOSiOS Release Note` y
  `Meeting: Meeting · 16:25`, confirmando navegación de regreso y persistencia
  observable tras reinicio. Evidencia: `ios-library-persistence-current.png`
  (SHA-256
  `891f4519547537c20ec9290586270d46e4e82a12bf2d7ba6b041eab5b22258ee`).
- En ese mismo binario se inició Dictar, se observó `Escuchando` durante 13 s y
  se detuvo la captura. El simulador no aportó voz; la UI terminó en
  `No se detectó voz en la grabación`, sin afirmar STT. Evidencia:
  `ios-release-dictation-listening.png` y `ios-release-dictation-stopped.png`.
- También se inició un Meeting real, se observó `Grabando`/`Escuchando`, se
  marcó un momento, se terminó y se abrió el registro guardado. El resultado
  fue `0:33`, `0 segmentos`, con `1 momento marcado`, consistente con la entrada
  silenciosa del simulador. Evidencia: `ios-release-meeting-listening.png` y
  `ios-release-meeting-saved.png`.
- Repetición adicional en la app instalada: `Capture` abrió el flujo Meeting,
  `Empezar meeting` mostró `Grabando`/`Escuchando`, `Marcar momento` actualizó la
  pantalla a `1 momento marcado`, y `Terminar` abrió el registro guardado con
  `0 segmentos`. Evidencia: `ios-meeting-marked-saved-current.png` (SHA-256
  `d368b2d70749911a330d20a0eee8f5a0237967719a9cedb74a3cdce9dd47eab6`). Esto
  prueba el flujo real de estado, marcador y persistencia, no transcripción con
  voz humana.
- Desde ese meeting se abrió `Preguntar sobre este meeting` en la app real.
  La pantalla `Ask Looper` cargó el historial y mostró el error explícito
  `No API key available for the configured model`, por lo que la UI y el
  manejo de configuración faltante están verificados, pero no una respuesta LLM
  exitosa. Evidencia: `ios-ask-no-api-key-current.png` (SHA-256
  `87516da6393d7571d74d42b7b871fdd7e67fed958dcef351163676ae6987608b`).
- La ruta de importación se recorrió hasta el Document Picker nativo de iOS;
  `Recents` y `On My iPhone` estaban vacíos, así que no se seleccionó ni aplicó
  un archivo. Evidencia: `ios-release-document-picker.png`. La selección iOS
  sigue pendiente por falta de un archivo disponible dentro del simulador.
- Repetición directa sobre la build Release actualmente instalada: desde
  `Importar` se pulsó `Elegir archivo` y el picker volvió a mostrar
  `No Shared Files` / `Shared files will appear here`; no había un documento
  seleccionable y la importación no pudo completarse. Evidencia capturada en
  `.argent/recordings/ios-document-picker-empty-live.png` (SHA-256
  `b60cab96a7465f759e9e0f807282eda8285110595dab222fc2bbb3ce241f9764`).
- Se intentó habilitar una ruta de prueba adicional desde Safari: el simulador
  descargó `looper-import.md`, pero Files siguió mostrando `On My iPhone is
  Empty`, sin un archivo seleccionable para el Document Picker. Se conserva
  como evidencia negativa, no como una importación exitosa:
  `.argent/recordings/ios-files-after-download-empty-live.png` (SHA-256
  `59f01d0e57e3f7bee16551156531cd4715f5d30178664001aac8a987e15aa0fe`).
- En una exploración adicional del picker se abrió `Browse` y se inspeccionó
  también el menú `More`; `On My iPhone` continuó sin archivos. Al volver a
  la superficie de importación solo quedó el estado `In progress`, sin un
  documento seleccionable ni una importación aplicada. Evidencia:
  `.argent/recordings/ios-import-after-more-live.png` (SHA-256
  `f9a17a8ec8b456243d5c05c24d0c44cd04399b05fb3d6574d1bf5087f4259684`).
- Se intentó una segunda vía real: Safari descargó/abrió un Markdown servido
  localmente y su hoja de compartir mostró `Looper` como destino. Al seleccionarlo
  no se abrió una importación ni apareció un item nuevo al relanzar Looper; el
  resultado se conserva como negativo, no como pase. Evidencia de la hoja:
  `ios-share-to-looper-current.png` (SHA-256
  `6645f75062439b90b629c4c4cb2c4a2555df605bcb4d96fba18dc19027dea1d9`) y
  de la app sin importación: `ios-after-share-looper-current.png` (SHA-256
  `4fbbce70f47f4c75d71ec32b14b19ab6e294478421294bd05e4701aedf5d71f3`).
  La pantalla `More` del sistema solo ofreció News, Reminders y Looper; no
  expuso Files como destino guardable en este simulador. Se abrió directamente
  `com.apple.DocumentsApp` y confirmó `On My iPhone is Empty`; tampoco apareció
  una acción `Save to Files` en la lista ampliada de Safari. Evidencias:
  `ios-files-empty-current.png` (SHA-256
  `b54d8b5ce3ab74d57cd9069cba66efbd894eedf93643a0304ded82ef4f7253a0`) y
  `ios-share-actions-no-files-current.png` (SHA-256
  `1a17b2d189de767b178445ed38ddc709b123179f5cfb167beb87b9f7d85a2932`).
- XcodeBuildMCP detectó dos iPhone físicos y un iPad físico conectados. Se
  intentó el build real de `Looper` con
  `apps/mobile/ios/Looper.xcworkspace` y el scheme `Looper`, incluyendo
  provisioning automático. Xcode llegó al proyecto, pero falló antes de
  instalar por falta de una cuenta para el Team `9Y84AJHU4X` y de perfiles para
  `com.j11.looper.mobile`, `com.j11.looper.mobile.keyboard` y
  `com.j11.looper.mobile.widgets`. Evidencia completa:
  `docs/rebuild/real-product-evidence/ios-device-build.txt`.
- No hay dispositivo Android físico conectado; Android quedó validado en el
  emulador. Sí se ejecutó allí la extensión IME real del APK release: se
  habilitó `com.j11.looper.mobile/.LooperIME`, se abrió una nota real y se
  confirmó la inserción de `@` en el campo, el cambio a formato Email y la
  transición `Dictate` → `Listening` → `Transcription failed` al detener una
  captura sin voz. El emulador no aporta habla humana ni backend STT, por lo
  que no se afirma un transcript. Evidencia y hashes:
  `android-looper-ime-visible.png`
  (`c1acad19b3f2291cd470e95b71d9a1ba46cbb830d03f5929a01f23baf2933181`),
  `android-looper-ime-email-format.png`
  (`f5226ddd7e38f47e9aa8eedb2d68e56a391656d4af26db1e72e0eff152978471`) y
  `android-looper-ime-transcription-failed.png`
  (`10a0d947b7225e7c96a606b8f031b8a8ed3d61193ee75744f0150ff08459fef7`).
- La extensión iOS `LooperKeyboard` también se compiló en Release con
  `xcodebuildmcp`, se verificó habilitada en Settings → General → Keyboard y
  se cambió a ella desde una nota real. Se observaron `Ready to dictate`,
  `Listening` y el retorno a `Ready to dictate` al detener; no se presenta
  transcript porque el simulador estaba silencioso. Evidencia y hashes:
  `ios-looper-keyboard-active.png`
  (`12b6e2b697b1a0790e992b083304a0ef62a9e7b34c5de74dc69c27770c66e1cf`),
  `ios-looper-keyboard-listening.png`
  (`75303da426ae44828994864731fa482f04b871b18e29a0dfd4c21789750250c7`) y
  `ios-looper-keyboard-ready-after-stop.png`
  (`cfef36d6cf82040de1cc7ea92e68bf05a8b3b855616c0b0cefbaff43d1d2360e`).
- Desde `Studio → Configuración del teclado` se abrió la pantalla nativa real
  de Android `On-screen keyboard`; `Looper` apareció habilitado junto a Gboard
  y Google Voice Typing. Evidencia: `android-looper-ime-settings-enabled-current.png`
  (SHA-256
  `806e1d3e0334cfce4956be7ff141e5c64f906380329ec642d394a30b246ab8a8`).
- Repetición iOS dentro de una nota real: se activó `LooperKeyboard`, se abrió
  `Transformation`, se eligió `Bullets`, el indicador cambió a `Bullets · No
  style`, y el botón pasó por `Ready to dictate` → `Listening` → `Ready to
  dictate` al detener. Evidencia: `ios-keyboard-bullets-listening-current.png`
  (SHA-256
  `aec98a43b7d172d6fe474d0377ac944de8aa26527624b8b5f17cf807675fb544`) y
  `ios-keyboard-bullets-ready-current.png` (SHA-256
  `f272d622be2b9857dfe05bbab4f6c40f2362113691472aee845e658c851c0694`). El
  simulador no aporta voz humana, así que no se afirma transcript ni inserción
  de texto derivada de STT.
- Después de relanzar la app y volver a enfocar la misma nota, `LooperKeyboard`
  conservó `Bullets · No style`, confirmando persistencia real de la
  configuración del teclado. Evidencia: `ios-keyboard-bullets-persisted-current.png`
  (SHA-256
  `e5363b575aaf94796832b7be95b10ce9e104f386fbb62a8c6e3ac576889b2cd0`).
- En una repetición adicional, el teclado nativo mostró el selector `Next
  keyboard` con valor `LooperKeyboard` mientras el campo de la nota estaba
  enfocado, confirmando que la extensión está disponible para el host real.
  Evidencia: `ios-system-keyboard-switch-to-looper-current.png` (SHA-256
  `2326eb916114cde4a72bc3685cb99de1c4735188566a5e75c95157569ed62211`).
- En la comprobación iOS más reciente, con la nota real enfocada se abrió el
  selector `Transformation`, se seleccionó `No style` y se cerró el menú; la
  app volvió al estado `Ready to dictate` y `Guardado`. Evidencia:
  `.argent/recordings/ios-looper-keyboard-transformation-closed-live.png`
  (SHA-256
  `929c032102a7070b210fe129524ec0fa6d9d0bcdb9f52e7c25d06c8820b6d99f`).
- Repetición Android dentro de una nota real: al enfocar el cuerpo se abrió
  `LooperIME`, el teclado mostró `Smart Mode: QA Android Smart Mode` junto con
  `Bullets`, y el control nativo `Insert at symbol` añadió un segundo `@` al
  cuerpo persistido (`@ @`). Esto confirma el ciclo app real → IME real →
  inserción en el editor, no solo la habilitación del servicio. Evidencia:
  `android-looper-ime-smart-mode-insert-current.png` (SHA-256
  `642c2746e56eb93c91dd379de6ddd37a9bd61cbeb3875eb978e1456615daa245`).
- Después de ocultar el IME y relanzar `com.j11.looper.mobile`, la nota volvió
  a abrirse con el cuerpo `@ @` y estado `Guardado`. Evidencia:
  `android-ime-note-persisted-after-relaunch-current.png` (SHA-256
  `c3d3ccac64fff41a0f2284e77cd56cb806cf3a4cdb2edec774f6943fe357b78b`).
- Comprobación adicional en la misma app real: al volver a enfocar el cuerpo
  de la nota persistida, `LooperIME` se abrió y expuso `Dictate`, los formatos
  `Bullets/Email/Message/To-do` y los controles `Insert at symbol`, `Insert
  space`, `Insert return` y `Delete`. Evidencia:
  `.argent/recordings/android-looper-ime-note-editor-live.png` (SHA-256
  `b83279b479813ef57661bc15f6b9ee3f5a3a25f4769c66dc5b2bd06859bbeb28`).
- En una comprobación Android posterior sobre la misma app real, `LooperIME`
  volvió a aparecer al enfocar el editor y mostró `Dictate`, los cuatro
  formatos (`Bullets`, `Email`, `Message`, `To-do`), los tonos y los controles
  `Insert at symbol`, `Insert space`, `Insert return` y `Delete`, mientras la
  nota permanecía en `Guardado`. Evidencia fresca:
  `.argent/recordings/android-looper-ime-current-live.png` (SHA-256
  `6c8df3b577a6aeaaff7a99b0a6ab7530c446733e3d057c5af027d026a82df208`).
- En una comprobación nueva del host real de Notas Android se creó una nota,
  se escribió `QA Android note` con el teclado del emulador y la UI confirmó
  `Guardado`. Se abrió el diálogo nativo `Eliminar nota`, se confirmó
  `ELIMINAR` y la nota desapareció de Library; solo quedó la nota preexistente
  `Untitled note`. Evidencias: `.argent/recordings/android-notes-real.png`
  (SHA-256 `62d4f29b36d4ec3ad83ed12bf82244d56532dcce8ecc5cf0d86e77a4a649bff1`)
  y `.argent/recordings/android-notes-deleted-real.png` (SHA-256
  `bd5302251eea44579eda373a0c947a695df2fde4b24704903b11e011f84d9c67`).
- Se probó el ciclo de configuración en la app real: al desactivar `QA Android
  Smart Mode` desde `Studio → Smart Modes`, el IME volvió a mostrar solo los
  estilos directos (`Claro y breve`, `Cálido`, `Notas estructuradas`) y dejó de
  mostrar el chip `Smart Mode`; al activarlo de nuevo, la fila quedó
  `checked` y el estado mostró `Guardado`. Evidencias:
  `android-smart-mode-disabled-ime-current.png` (SHA-256
  `0261606390cc0d7abca6b4ef007f0cba3975a9c5f6733893e0ee755aa5d20a0f`) y
  `android-smart-mode-reenabled-current.png` (SHA-256
  `f96edd3e2e93a88e324590ab21e4bc1318b1f88516e1718594cbe04e3a388e2c`).
- Se grabó además el flujo Android real de enfocar la nota, abrir el IME y
  pulsar `Insert at symbol`: [screen-recording-emulator-5554-1787097502401.mp4](../../.argent/recordings/screen-recording-emulator-5554-1787097502401.mp4),
  25.4 s, 411 KB; `ffprobe` lo leyó correctamente.

## Web real (Chromium local)

- Se inició `apps/web` con Vite contra el Convex local (`VITE_CONVEX_URL`)
  y se abrió la aplicación en Chromium real mediante `agent-browser`.
- La primera ejecución falló en runtime porque faltaba `VITE_CONVEX_URL`; se
  reinició el proceso con `VITE_CONVEX_URL=http://127.0.0.1:3210`. No se
  escribió ningún secreto ni se modificó un archivo de entorno.
- Se recorrió el onboarding real: objetivo, selección de acceso, consentimiento
  y lanzamiento del Recording Assistant. Se creó un hilo real de dos mensajes.
  Evidencia: `docs/rebuild/real-product-evidence/web-onboarding.webm` y las
  capturas `web-onboarding-*`/`web-assistant*`.
- El hilo llegó al backend y devolvió el estado real `No API key available for
  the configured model`; no se presenta como respuesta LLM exitosa porque el
  entorno local no tiene una clave de proveedor.
- Repetición actual del shell web local (`VITE_CONVEX_URL=http://127.0.0.1:3210`)
  en Chromium real: landing → Setup/Outcome → Access → Launch → Transcribe.
  Se seleccionó `Transcribe audio`, `Start with Looper access` y `Open Voice`; la
  ruta terminó en `/transcribe` con los controles File/Live, selector Deepgram y
  botón de transcripción visibles. Capturas nuevas: `web-current-landing.png`,
  `web-current-welcome.png`, `web-current-access.png`, `web-current-launch.png`
  y `web-current-transcribe.png`.
- Se abrió la ruta real `Transcribe`, que mostró los modos File/Live, selector
  de proveedor y controles de grabación. En una repetición controlada se
  entregó un WAV de un segundo al `<input type=file>` real; el upload llegó a
  Convex (`POST /api/storage/upload` 200) y la acción de transcripción falló
  explícitamente con `DEEPGRAM_API_KEY not set`. El archivo quedó seleccionado,
  pero no hubo transcript; evidencia: `web-transcribe-upload.webm` y
  `web-transcribe-deepgram-missing-key.png`.
- Deepgram no es el único proveedor de esa superficie: el catálogo y las
  acciones backend declaran cuatro proveedores STT (`deepgram`, `assemblyai`,
  `elevenlabs` y `openai`) para batch y realtime. La prueba web alcanzó el
  selector/ruta configurada para Deepgram y falló por la clave ausente; no se
  debe interpretar como evidencia de que los otros tres estén implementados
  o probados en red en este entorno.
- Repetición visual en la app web real: el selector de proveedor mostró los
  cuatro valores (`Deepgram`, `AssemblyAI`, `ElevenLabs`, `OpenAI`) en los modos
  `File` y `Live`, y permitió cambiar la selección hasta `OpenAI` sin error de
  UI. Capturas: `.tcompound/evidence/real-product/web-stt-provider-options-current.png`
  (File) y `.tcompound/evidence/real-product/web-stt-provider-options-live-current.png`
  (Live). Esto valida el catálogo visible, no la autenticación ni una sesión
  STT remota exitosa.
- Un intento previo con el WAV Harvard grande dejó el navegador sin respuesta
  durante el procesamiento; la repetición pequeña permitió aislar el bloqueo
  real del proveedor y no se presenta como transcripción web exitosa.
- Repetición del gate Playwright local el 18 de agosto de 2026: `pnpm run
  qa:web-e2e` terminó `2 passed` contra Convex local y Vite real, cubriendo
  `dictation-crud.spec.ts` y `transcribe-fixture.spec.ts`. Este gate confirma
  navegación, CRUD de diccionario/reemplazos/estilos y la superficie de
  transcripción con el fixture Harvard; no sustituye una llamada externa a un
  proveedor STT.
- Repetición manual adicional sobre Vite real y Convex local: se recorrió
  `landing → Setup/Outcome → Access → Launch → Transcribe`, se abrió `Dictation`
  y se añadió el término temporal `QA Real Term`; la fila apareció con su botón
  de eliminación y luego se eliminó, dejando el estado limpio. Evidencia:
  `.argent/recordings/web-real-dictation-term-added.png` (SHA-256
  `c8c6cbfdd3e4f120a8cf7ec1d21c93f5f45b2413116b6acc2a4cdd4d1527f586`) y
  video del flujo `.argent/recordings/web-real-local-shell.webm` (91,6 s,
  627606 bytes; SHA-256
  `1bcbd32a4fcff0f153f8e6cba0ff62e5a1ac7bab7c44ef9ef8ce12f84d27a2b2`). No se
  usaron credenciales de proveedor ni se afirma una transcripción remota.
- El servidor Vite temporal se detuvo al terminar; la evidencia queda dentro de
  `docs/rebuild/real-product-evidence/`.

Validación local:

```sh
shasum -a 256 .tcompound/evidence/real-product/desktop-home-positive.*
```

## Alcance de esta evidencia

Esto prueba que el shell desktop puede abrirse y renderizar Home en el host
macOS utilizado para la reconstrucción; la repetición actual del canal de
inserción escribió y deshizo texto en TextEdit con permisos nativos disponibles. También prueba el hotkey `Fn`, la transición visible del pill, captura acústica real, las extensiones IME reales en simulador/emulador y varias rutas del shell móvil. No prueba por sí solo voz humana en todos los dispositivos, modelos remotos, checkout, Windows, teclado IME en dispositivo físico ni producción.

La matriz completa de paridad mantiene esas capacidades como `pending` cuando
requieren un dispositivo, permisos o un servicio externo.

## Comprobación de evidencia histórica

También se inspeccionó el checkout separado `/Users/zoro/j11/old_looper-audit`
(commit `0185a83`). Su propio `docs/NEXT_STEPS.md` todavía enumera como trabajo
pendiente probar en un iPhone físico el permiso/captura de micrófono, el teclado
y el dictado remoto; no contiene una captura, video o reporte de ejecución que
cierre ese escenario. Por eso esa copia no se cuenta como evidencia adicional
para el `main` actual.

## Intento actual en hardware físico

El 18 de agosto de 2026 se detectó el iPhone físico `25Baam` (iOS 26.6,
UDID `F1AB6404-2AAF-58D5-B01D-F9387A4FAC18`) y se intentó instalar la build
Release actual de `apps/mobile/ios/Looper.xcworkspace`, scheme `Looper`. El
primer intento falló por perfiles ausentes para `Looper`, `LooperKeyboard` y
`LooperWidgets`; el reintento con `-allowProvisioningUpdates` confirmó que no
hay una cuenta Apple configurada para el Team `9Y84AJHU4X`. El build se detuvo
antes de instalar o ejecutar la app, por lo que no se presenta como prueba de
audio/teclado físico. Log completo: `ios-device-build-current.log` (SHA-256
`44e385f8913a2c5a59567be779338a6ad073fc99f09906e2741280fff9b4eee7`). También
se comprobó si ya existía una instalación previa para evitar recompilar: el
intento de lanzamiento falló porque el iPhone estaba bloqueado y no pudo montar
la Developer Disk Image (`kAMDMobileImageMounterDeviceLocked`).
