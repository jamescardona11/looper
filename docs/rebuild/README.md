# Reconstrucción incremental de Looper

Este directorio documenta la reconstrucción de Git y la sustitución selectiva de
bloques con procedencia no aceptada. El objetivo no es crear otra aplicación ni
reducir capacidades: se conserva el producto actual y se reemplaza únicamente
la expresión que no pueda entrar en el árbol nuevo.

## Estado inicial

- El checkout original no contiene `.git`.
- La copia de recuperación está en
  `/Users/zoro/j11/looper-reference-20260816`.
- Su manifiesto SHA-256 está en
  `/Users/zoro/j11/looper-reference-20260816.SHA256`.
- El baseline Desktop observado el 2026-08-15 fue `tsc` correcto, 66 archivos
  frontend y 254 pruebas correctas; Rust ejecutó 405 pruebas correctas y dejó
  5 ignoradas por permisos, modelos o recursos físicos.

El baseline sólo es un oráculo de regresión. No demuestra independencia de
procedencia ni comportamiento en un dispositivo real.

## Reglas de trabajo

1. No usar `git add .`; sólo se añaden rutas aprobadas explícitamente.
2. Un archivo mixto se divide por bloques cuando sea separable. Un archivo cuya
   organización y expresión dependan principalmente de una referencia se
   reemplaza como módulo, conservando su contrato público.
3. Código, documentación y configuración escritos por nosotros pueden entrar
   directamente. Código o assets de terceros sólo entran cuando la licencia
   permisiva está verificada y su copyright, licencia y NOTICE quedan
   registrados junto al uso concreto. AGPL/GPL, licencia incierta o atribución
   incompleta quedan fuera hasta resolverlos.
4. Los contratos observables se mantienen: comandos Tauri, eventos, payloads,
   almacenamiento, deep links, hotkeys, identificadores nativos y APIs de
   backend. Una migración compatible acompaña cualquier cambio necesario.
5. Cada feature se cierra con implementación, pruebas nuevas, actualización de
   `PROVENANCE_LEDGER.csv`, evidencia de regresión y un commit separado.
6. La auditoría de similitud es un filtro de revisión, no una conclusión
   jurídica. La publicación queda separada de la revisión legal final.

## Licencia de destino

La intención técnica actual es publicar el código propio bajo `AGPL-3.0-only`.
El titular legal exacto todavía no está registrado; mientras tanto, no se debe
publicar ni afirmar una titularidad individual. El valor colectivo
`Looper contributors` es sólo un valor provisional para la documentación.
