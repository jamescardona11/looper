# Reconstrucción incremental de Looper

Este directorio conserva el procedimiento técnico usado para reconstruir la
historia de Git y sustituir bloques cuya procedencia requería revisión. El
objetivo es conservar la funcionalidad observable sin copiar una estructura
externa por inercia.

## Invariantes verificables

- La raíz de la historia nueva es `b1efa21`.
- `LICENSE` contiene el texto completo de GNU AGPL v3.
- `COPYRIGHT` identifica a James Cardona como titular de las contribuciones
  originales de Looper.
- Handy y Wispr no forman parte del árbol reconstruido.
- La rama activa se verifica con `tools/provenance/history-audit.py`,
  `tools/provenance/corpus-audit.py` y la compuerta
  `tools/provenance/check-staged.mjs`.
- Los enlaces de Markdown y las rutas locales se verifican con
  `pnpm run docs:check`.

## Auditoría reproducible

Desde la raíz del checkout:

```sh
python3 tools/provenance/corpus-audit.py /tmp/looper-audit \
  --refs /ruta/a/voices/refs
python3 tools/provenance/history-audit.py
```

La salida contiene `corpus-inventory.csv` y `corpus-summary.json`. El umbral
del informe es una señal técnica de revisión; no es un dictamen jurídico ni
prueba por sí solo autoría independiente.

`history-audit.py` inspecciona la historia alcanzable desde `HEAD`: comprueba
la ausencia de las rutas retiradas, sus filas históricas del ledger y la
presencia de AGPLv3 y COPYRIGHT en el commit raíz. Los backups locales de
reescrituras anteriores se conservan fuera de la historia alcanzable de la
rama activa.

Antes de cada commit de trabajo:

```sh
node tools/provenance/check-staged.mjs
```

La compuerta acepta filas exactas o patrones de ruta del ledger. Los bloques
permisivos deben apuntar a un `THIRD_PARTY_NOTICES.md` o licencia verificable.

## Criterios de cierre por feature

Una feature se considera cerrada solo cuando conserva sus contratos observables,
tiene pruebas de regresión, pasa la auditoría de similitud y cuenta con
evidencia de ejecución proporcional a su superficie. Las pruebas unitarias no
se presentan como evidencia de micrófono, Accessibility, Tauri, proveedor
remoto, dispositivo físico o producción.

La revisión legal externa sigue siendo necesaria antes de publicar o
redistribuir el producto.
