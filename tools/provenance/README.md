# Compuerta de procedencia

`check-staged.mjs` es una compuerta pequeña para el proceso de reconstrucción.
Sólo inspecciona lo que ya está en el index de Git y exige que cada ruta tenga
una fila explícita en `docs/rebuild/PROVENANCE_LEDGER.csv` con estado `owned`,
`replaced` o `permissive`. Las filas `permissive` también deben indicar el
archivo NOTICE que conserva la atribución.

`history-audit.py` comprueba la historia alcanzable desde `HEAD`: no permite
que regresen las rutas retiradas de Handy/Wispr, sus filas históricas del ledger
ni una raíz sin GNU AGPLv3 y COPYRIGHT de James Cardona.
También informa, sin incorporarlos al resultado activo, los refs locales de
respaldo `codex/rebuild/agpl-history-root-*` y si alguno conserva esas rutas.
Los respaldos se mantienen para recuperación; no deben usarse como la rama de
distribución. Además reporta snapshots internos bajo `refs/codex/` como
`tool_ref_findings`: son residuos del agente local, no ramas de distribución,
pero deben purgarse cuando ningún proceso los necesite.

Uso desde la raíz del repositorio:

```sh
node tools/provenance/check-staged.mjs
python3 tools/provenance/history-audit.py
```

La compuerta no determina una conclusión legal ni sustituye la revisión de un
bloque. Su función es evitar que una ruta ajena, generada o sin clasificación
llegue por error a un commit incremental.
