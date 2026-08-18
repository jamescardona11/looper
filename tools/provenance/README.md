# Compuerta de procedencia

`check-staged.mjs` es una compuerta pequeña para el proceso de reconstrucción.
Sólo inspecciona lo que ya está en el index de Git y exige que cada ruta tenga
una fila explícita en `docs/rebuild/PROVENANCE_LEDGER.csv` con un estado cerrado.

Uso desde la raíz del repositorio:

```sh
node tools/provenance/check-staged.mjs
```

La compuerta no determina una conclusión legal ni sustituye la revisión de un
bloque. Su función es evitar que una ruta sin clasificación llegue por error a
un commit incremental.
