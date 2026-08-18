# Evidencia de ejecución real

Esta evidencia corresponde a una ejecución real de la ventana Tauri de Looper,
no a un render de jsdom ni a una prueba unitaria.

## Desktop Home

Artefactos locales (ignorados por Git para no inflar la historia):

- `.tcompound/evidence/real-product/desktop-home-positive.png`
- `.tcompound/evidence/real-product/desktop-home-positive.mov`
- `.tcompound/evidence/real-product/desktop-packaged-home.png`

La captura muestra la ventana `Looper` cargando Home, el saludo del día, el
panel `Ready to write anywhere`, navegación lateral y el campo de Memory. El
video dura aproximadamente 8 segundos y conserva la misma sesión visual.

Hashes SHA-256 de la evidencia inspeccionada:

```text
4fab2f1b15f0be42f37c72afdcbee1b4c91a75228b08469d2a7ef1bd9620b6b5  desktop-home-positive.png
4c624e58f53e15451e9a943630591a167d91b7c23dfb04704892cb95731bc591  desktop-home-positive.mov
81bb5ec2d4f8d41a8f0b03fc489ebef953be861372c266802783aab4ffa1e40a  desktop-packaged-home.png
```

El binario empaquetado que produjo la captura fue:

- `apps/desktop/src-tauri/target/debug/bundle/macos/Looper.app`
- `apps/desktop/src-tauri/target/debug/bundle/macos/Looper.app.tar.gz`

Se construyó con `pnpm --dir apps/desktop tauri build --debug --bundles app
--no-sign`; por tanto demuestra compilación y ejecución local, no firma,
notarización ni distribución de producción.

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
