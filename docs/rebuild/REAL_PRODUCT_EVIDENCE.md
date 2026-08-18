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
macOS utilizado para la reconstrucción. No prueba por sí solo micrófono,
Accessibility, hotkeys globales, inserción en otra aplicación, modelos locales,
proveedores remotos, checkout, Windows, iOS, Android ni producción.

La matriz completa de paridad mantiene esas capacidades como `pending` cuando
requieren un dispositivo, permisos o un servicio externo.
