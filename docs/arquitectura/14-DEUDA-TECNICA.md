# Hallazgos y deuda técnica

Auditoría 2026-10-07 · Backend `4189fa483ecbbed242946cefc6d4282e0e13dfe8` · Frontend `be0f12e0bf48d6df05afb1eced092b34c915e1cf`.

[Índice](00-README.md) · [Documento maestro](../ARQUITECTURA-INVENTARIO.md)

## Contenido

- [Severidad](#severidad)
- [Registro de deuda](#registro-de-deuda)
- [Warnings actuales](#warnings-actuales)
- [Untracked previos clasificados](#untracked-previos-clasificados)
- [Prioridades](#prioridades)

## Severidad

CRÍTICO pérdida/compromiso demostrado; ALTO bloquea entrega productiva fiable o afecta acceso relevante; MEDIO riesgo operacional/integridad/mantenimiento; BAJO higiene sin impacto funcional demostrado; INFORMATIVO contexto. No se confirmó CRÍTICO en inspección, que no es pentest ni análisis CVE/producción.

## Registro de deuda


| Severidad | Hallazgo | Evidencia | Tratamiento propuesto |
| --- | --- | --- | --- |
| ALTO | Producción/CD/backup no implementados | Sin registry/deploy/restore en workflow | Diseñar antes de publicar |
| ALTO | Migraciones compartidas sin paquetes | refs/snapshots sin migration.ts; actual untracked | Origen conocido/grafo/replay |
| ALTO | JWT conserva permisos emitidos | Guard no reconsulta DB | Revocación/reconsulta/TTL según amenaza |
| MEDIO | Bearer accesible a JS | sessionStorage/localStorage | Reducir XSS/evaluar sesión |
| MEDIO | Login sin throttling/MFA identificado | Código/dependencias inspeccionados | Evaluar exposición |
| MEDIO | EXCLUDE fuera contrato | SQL/script adicional | Paso deploy y inspección explícita |
| MEDIO | Idempotencia por nombre | No compara definición/serializa DDL | Verificar definición/control admin |
| MEDIO | Prisma RC/dependencia Prisma 7 | orm rc.11/CLI rc.15/client 7.10 | Revisar uso/compatibilidad sin upgrade automático |
| MEDIO | Evidence diagnóstica retención 7 días | YAML | Archive seguro |
| MEDIO | PG E2E tag flotante | postgres:17 lifecycle | Fijar digest si requiere replay exacto |
| MEDIO | Auditoría posterior puede fallar | audit_failure interceptor | Alertar/reconciliar |
| MEDIO | Previews sin purga operativa | Datos/planes persistidos | Retención/privacidad |
| MEDIO | Actions Node20 forzado24 | Warning remoto confirmado | Actualizar SHA/revalidar aparte |
| BAJO | IsBoolean unused | update-categoria.dto.ts:3 | Limpiar en tarea aparte |
| BAJO | password bindings unused | usuarios.service.ts:13/:49 | Conservar exclusión de credenciales al limpiar |
| BAJO | 4 escapes innecesarios | api-infraestructura.e2e-spec.ts:305 | Limpieza sin cambiar assertions |
| BAJO | vite-tsconfig-paths redundante según Vite | Warning unit actual | Evaluar resolve.tsconfigPaths |
| INFORMATIVO | Reader skipped opcional | 1/ciclo permitido por validator | Conservar contexto/añadir cuenta si requerido |
| INFORMATIVO | UI reportes/auditoria futura | futureModules sin rutas | Planificar si requisito |
| INFORMATIVO | Develop local existente antigua | 0252b61 | Preservar/ref nueva sólo autorizada |

## Warnings actuales

Lint backend exit 0 y **7 warnings**: IsBoolean 1, password bindings 2, escapes 4. Password es destructuring para excluir credenciales; no quitar ciegamente esa exclusión ni interpretarlo como filtración. Ninguno corregido.

Logs remotos: actions Node20→24, punycode deprecated, eslint 9.39.1 sin soporte y tsconfck 3.1.6 unmaintained. Deprecation no demuestra vulnerabilidad; no se ejecutó npm audit ni se inventaron CVE.

## Untracked previos clasificados

Lista expandida git ls-files --others --exclude-standard, excluyendo los 17 documentos de esta auditoría. Sin eliminar ninguno. design-references contiene 3 CSV/XLSX comerciales, conservados con acceso controlado; nombres individuales omitidos para no replicar identificadores comerciales. ZIP no extraído a documentación.


| Archivo | Clasificación/acción |
| --- | --- |
| [backend/docs/API-VALIDACION.md](../API-VALIDACION.md) | Documentación histórica/funcional; revisar versionado selectivo |
| [backend/docs/CLIENTES.md](../CLIENTES.md) | Documentación histórica/funcional; revisar versionado selectivo |
| [backend/docs/Fw__datos.zip](../Fw__datos.zip) | Binario comercial; acceso controlado, revisar privacidad |
| [backend/docs/IMPORTACION-CLIENTES.md](../IMPORTACION-CLIENTES.md) | Documentación histórica/funcional; revisar versionado selectivo |
| [backend/docs/IMPORTACION-PRECIOS.md](../IMPORTACION-PRECIOS.md) | Documentación histórica/funcional; revisar versionado selectivo |
| [backend/docs/IMPORTACION-PRODUCTOS.md](../IMPORTACION-PRODUCTOS.md) | Documentación histórica/funcional; revisar versionado selectivo |
| [backend/docs/IMPORTACIONES.md](../IMPORTACIONES.md) | Documentación histórica/funcional; revisar versionado selectivo |
| [backend/docs/LISTAS-PRECIOS.md](../LISTAS-PRECIOS.md) | Documentación histórica/funcional; revisar versionado selectivo |
| [backend/docs/MODELO-COMESI.md](../MODELO-COMESI.md) | Documentación histórica/funcional; revisar versionado selectivo |
| [backend/docs/PRODUCTOS.md](../PRODUCTOS.md) | Documentación histórica/funcional; revisar versionado selectivo |
| [backend/docs/UNIDADES-MEDIDA.md](../UNIDADES-MEDIDA.md) | Documentación histórica/funcional; revisar versionado selectivo |
| [backend/docs/VALIDACION-BACKEND-5A.md](../VALIDACION-BACKEND-5A.md) | Documentación histórica/funcional; revisar versionado selectivo |
| [backend/docs/VALIDACION-BACKEND-5B.md](../VALIDACION-BACKEND-5B.md) | Documentación histórica/funcional; revisar versionado selectivo |
| [backend/docs/VALIDACION-BACKEND-5C.md](../VALIDACION-BACKEND-5C.md) | Documentación histórica/funcional; revisar versionado selectivo |
| [backend/docs/VALIDACION-DASHBOARD-REPORTES-2026-10-05.md](../VALIDACION-DASHBOARD-REPORTES-2026-10-05.md) | Documentación histórica/funcional; revisar versionado selectivo |
| [backend/docs/VALIDACION-DEVOLUCIONES-2026-10-05.md](../VALIDACION-DEVOLUCIONES-2026-10-05.md) | Documentación histórica/funcional; revisar versionado selectivo |
| [backend/docs/VALIDACION-VENTAS-2026-10-05.md](../VALIDACION-VENTAS-2026-10-05.md) | Documentación histórica/funcional; revisar versionado selectivo |
| [backend/docs/api-archivos.json](../api-archivos.json) | Evidence/contrato/plan; preservar identidad y resultados |
| [backend/docs/api-baseline-e2e.json](../api-baseline-e2e.json) | Evidence/contrato/plan; preservar identidad y resultados |
| [backend/docs/api-baseline-unit.json](../api-baseline-unit.json) | Evidence/contrato/plan; preservar identidad y resultados |
| [backend/docs/api-db-dry-run.jsonl](../api-db-dry-run.jsonl) | Evidence/contrato/plan; preservar identidad y resultados |
| [backend/docs/api-db-plan-inicial.jsonl](../api-db-plan-inicial.jsonl) | Evidence/contrato/plan; preservar identidad y resultados |
| [backend/docs/api-db-verify.jsonl](../api-db-verify.jsonl) | Evidence/contrato/plan; preservar identidad y resultados |
| [backend/docs/api-e2e.json](../api-e2e.json) | Evidence/contrato/plan; preservar identidad y resultados |
| [backend/docs/api-evidencia.json](../api-evidencia.json) | Evidence/contrato/plan; preservar identidad y resultados |
| [backend/docs/api-infraestructura.postman_collection.json](../api-infraestructura.postman_collection.json) | Colección API; revisar secrets antes de compartir |
| [backend/docs/api-integridad.json](../api-integridad.json) | Evidence/contrato/plan; preservar identidad y resultados |
| [backend/docs/api-nuevas-e2e.json](../api-nuevas-e2e.json) | Evidence/contrato/plan; preservar identidad y resultados |
| [backend/docs/api-regresion.json](../api-regresion.json) | Evidence/contrato/plan; preservar identidad y resultados |
| [backend/docs/api-secretos.json](../api-secretos.json) | Evidence/contrato/plan; preservar identidad y resultados |
| [backend/docs/api-swagger-browser.json](../api-swagger-browser.json) | Evidence/contrato/plan; preservar identidad y resultados |
| [backend/docs/api-unit.json](../api-unit.json) | Evidence/contrato/plan; preservar identidad y resultados |
| [backend/docs/backend-5a/archivos.json](../backend-5a/archivos.json) | Evidence/contrato/plan; preservar identidad y resultados |
| [backend/docs/backend-5a/baseline-checks.json](../backend-5a/baseline-checks.json) | Evidence/contrato/plan; preservar identidad y resultados |
| [backend/docs/backend-5a/baseline-db-dry-run.jsonl](../backend-5a/baseline-db-dry-run.jsonl) | Evidence/contrato/plan; preservar identidad y resultados |
| [backend/docs/backend-5a/baseline-db-verify.jsonl](../backend-5a/baseline-db-verify.jsonl) | Evidence/contrato/plan; preservar identidad y resultados |
| [backend/docs/backend-5a/baseline-e2e.json](../backend-5a/baseline-e2e.json) | Evidence/contrato/plan; preservar identidad y resultados |
| [backend/docs/backend-5a/baseline-unit.json](../backend-5a/baseline-unit.json) | Evidence/contrato/plan; preservar identidad y resultados |
| [backend/docs/backend-5a/campos-observados.json](../backend-5a/campos-observados.json) | Evidence/contrato/plan; preservar identidad y resultados |
| [backend/docs/backend-5a/contract-antes.d.ts](../backend-5a/contract-antes.d.ts) | Evidence/contrato/plan; preservar identidad y resultados |
| [backend/docs/backend-5a/contract-antes.json](../backend-5a/contract-antes.json) | Evidence/contrato/plan; preservar identidad y resultados |
| [backend/docs/backend-5a/contract-antes.prisma](../backend-5a/contract-antes.prisma) | Evidence/contrato/plan; preservar identidad y resultados |
| [backend/docs/backend-5a/contract-comparacion.json](../backend-5a/contract-comparacion.json) | Evidence/contrato/plan; preservar identidad y resultados |
| [backend/docs/backend-5a/contract-despues.d.ts](../backend-5a/contract-despues.d.ts) | Evidence/contrato/plan; preservar identidad y resultados |
| [backend/docs/backend-5a/contract-despues.json](../backend-5a/contract-despues.json) | Evidence/contrato/plan; preservar identidad y resultados |
| [backend/docs/backend-5a/contract-despues.prisma](../backend-5a/contract-despues.prisma) | Evidence/contrato/plan; preservar identidad y resultados |
| [backend/docs/backend-5a/contract-emit.jsonl](../backend-5a/contract-emit.jsonl) | Evidence/contrato/plan; preservar identidad y resultados |
| [backend/docs/backend-5a/db-update.jsonl](../backend-5a/db-update.jsonl) | Evidence/contrato/plan; preservar identidad y resultados |
| [backend/docs/backend-5a/desarrollo-unit.json](../backend-5a/desarrollo-unit.json) | Evidence/contrato/plan; preservar identidad y resultados |
| [backend/docs/backend-5a/final-checks.json](../backend-5a/final-checks.json) | Evidence/contrato/plan; preservar identidad y resultados |
| [backend/docs/backend-5a/final-db-dry-run.jsonl](../backend-5a/final-db-dry-run.jsonl) | Evidence/contrato/plan; preservar identidad y resultados |
| [backend/docs/backend-5a/final-db-verify.jsonl](../backend-5a/final-db-verify.jsonl) | Evidence/contrato/plan; preservar identidad y resultados |
| [backend/docs/backend-5a/final-e2e.json](../backend-5a/final-e2e.json) | Evidence/contrato/plan; preservar identidad y resultados |
| [backend/docs/backend-5a/final-unit.json](../backend-5a/final-unit.json) | Evidence/contrato/plan; preservar identidad y resultados |
| [backend/docs/backend-5a/integridad.json](../backend-5a/integridad.json) | Evidence/contrato/plan; preservar identidad y resultados |
| [backend/docs/backend-5a/openapi.json](../backend-5a/openapi.json) | Evidence/contrato/plan; preservar identidad y resultados |
| [backend/docs/backend-5a/pre-update-dry-run.jsonl](../backend-5a/pre-update-dry-run.jsonl) | Evidence/contrato/plan; preservar identidad y resultados |
| [backend/docs/backend-5a/resumen.json](../backend-5a/resumen.json) | Evidence/contrato/plan; preservar identidad y resultados |
| [backend/docs/backend-5a/verificar-integridad.mjs](../backend-5a/verificar-integridad.mjs) | Herramienta integridad/generación; revisar alcance antes de ejecutar |
| [backend/docs/backend-5b/archivos.json](../backend-5b/archivos.json) | Evidence/contrato/plan; preservar identidad y resultados |
| [backend/docs/backend-5b/baseline-db-dry-run.jsonl](../backend-5b/baseline-db-dry-run.jsonl) | Evidence/contrato/plan; preservar identidad y resultados |
| [backend/docs/backend-5b/baseline-db-verify.jsonl](../backend-5b/baseline-db-verify.jsonl) | Evidence/contrato/plan; preservar identidad y resultados |
| [backend/docs/backend-5b/baseline-e2e.json](../backend-5b/baseline-e2e.json) | Evidence/contrato/plan; preservar identidad y resultados |
| [backend/docs/backend-5b/baseline-unit.json](../backend-5b/baseline-unit.json) | Evidence/contrato/plan; preservar identidad y resultados |
| [backend/docs/backend-5b/baseline.json](../backend-5b/baseline.json) | Evidence/contrato/plan; preservar identidad y resultados |
| [backend/docs/backend-5b/constraints.json](../backend-5b/constraints.json) | Evidence/contrato/plan; preservar identidad y resultados |
| [backend/docs/backend-5b/contract-antes.prisma](../backend-5b/contract-antes.prisma) | Evidence/contrato/plan; preservar identidad y resultados |
| [backend/docs/backend-5b/contract-emit.jsonl](../backend-5b/contract-emit.jsonl) | Evidence/contrato/plan; preservar identidad y resultados |
| [backend/docs/backend-5b/db-update.jsonl](../backend-5b/db-update.jsonl) | Evidence/contrato/plan; preservar identidad y resultados |
| [backend/docs/backend-5b/desarrollo-db-dry-run.jsonl](../backend-5b/desarrollo-db-dry-run.jsonl) | Evidence/contrato/plan; preservar identidad y resultados |
| [backend/docs/backend-5b/desarrollo-db-verify.jsonl](../backend-5b/desarrollo-db-verify.jsonl) | Evidence/contrato/plan; preservar identidad y resultados |
| [backend/docs/backend-5b/desarrollo-e2e.json](../backend-5b/desarrollo-e2e.json) | Evidence/contrato/plan; preservar identidad y resultados |
| [backend/docs/backend-5b/desarrollo-unit.json](../backend-5b/desarrollo-unit.json) | Evidence/contrato/plan; preservar identidad y resultados |
| [backend/docs/backend-5b/dry-run-after.jsonl](../backend-5b/dry-run-after.jsonl) | Evidence/contrato/plan; preservar identidad y resultados |
| [backend/docs/backend-5b/dry-run-before.jsonl](../backend-5b/dry-run-before.jsonl) | Evidence/contrato/plan; preservar identidad y resultados |
| [backend/docs/backend-5b/evidencia.json](../backend-5b/evidencia.json) | Evidence/contrato/plan; preservar identidad y resultados |
| [backend/docs/backend-5b/final-db-verify.jsonl](../backend-5b/final-db-verify.jsonl) | Evidence/contrato/plan; preservar identidad y resultados |
| [backend/docs/backend-5b/final-e2e.json](../backend-5b/final-e2e.json) | Evidence/contrato/plan; preservar identidad y resultados |
| [backend/docs/backend-5b/final-unit.json](../backend-5b/final-unit.json) | Evidence/contrato/plan; preservar identidad y resultados |
| [backend/docs/backend-5b/garantias-aplicadas.json](../backend-5b/garantias-aplicadas.json) | Evidence/contrato/plan; preservar identidad y resultados |
| [backend/docs/backend-5b/indexes.json](../backend-5b/indexes.json) | Evidence/contrato/plan; preservar identidad y resultados |
| [backend/docs/backend-5b/integridad.json](../backend-5b/integridad.json) | Evidence/contrato/plan; preservar identidad y resultados |
| [backend/docs/backend-5b/migration-plan.json](../backend-5b/migration-plan.json) | Evidence/contrato/plan; preservar identidad y resultados |
| [backend/docs/backend-5b/openapi.json](../backend-5b/openapi.json) | Evidence/contrato/plan; preservar identidad y resultados |
| [backend/docs/backend-5b/resumen.json](../backend-5b/resumen.json) | Evidence/contrato/plan; preservar identidad y resultados |
| [backend/docs/backend-5b/verificar-integridad.mjs](../backend-5b/verificar-integridad.mjs) | Herramienta integridad/generación; revisar alcance antes de ejecutar |
| [backend/docs/backend-5c/archivos.json](../backend-5c/archivos.json) | Evidence/contrato/plan; preservar identidad y resultados |
| [backend/docs/backend-5c/baseline-db-dry-run.jsonl](../backend-5c/baseline-db-dry-run.jsonl) | Evidence/contrato/plan; preservar identidad y resultados |
| [backend/docs/backend-5c/baseline-db-verify.jsonl](../backend-5c/baseline-db-verify.jsonl) | Evidence/contrato/plan; preservar identidad y resultados |
| [backend/docs/backend-5c/baseline-e2e-repeat.json](../backend-5c/baseline-e2e-repeat.json) | Evidence/contrato/plan; preservar identidad y resultados |
| [backend/docs/backend-5c/baseline-e2e.json](../backend-5c/baseline-e2e.json) | Evidence/contrato/plan; preservar identidad y resultados |
| [backend/docs/backend-5c/baseline-unit.json](../backend-5c/baseline-unit.json) | Evidence/contrato/plan; preservar identidad y resultados |
| [backend/docs/backend-5c/baseline.json](../backend-5c/baseline.json) | Evidence/contrato/plan; preservar identidad y resultados |
| [backend/docs/backend-5c/concurrencia.json](../backend-5c/concurrencia.json) | Evidence/contrato/plan; preservar identidad y resultados |
| [backend/docs/backend-5c/constraints.json](../backend-5c/constraints.json) | Evidence/contrato/plan; preservar identidad y resultados |
| [backend/docs/backend-5c/contract-antes.prisma](../backend-5c/contract-antes.prisma) | Evidence/contrato/plan; preservar identidad y resultados |
| [backend/docs/backend-5c/contract-comparacion.json](../backend-5c/contract-comparacion.json) | Evidence/contrato/plan; preservar identidad y resultados |
| [backend/docs/backend-5c/contract-emit.jsonl](../backend-5c/contract-emit.jsonl) | Evidence/contrato/plan; preservar identidad y resultados |
| [backend/docs/backend-5c/db-update-intento-1.jsonl](../backend-5c/db-update-intento-1.jsonl) | Evidence/contrato/plan; preservar identidad y resultados |
| [backend/docs/backend-5c/db-update.jsonl](../backend-5c/db-update.jsonl) | Evidence/contrato/plan; preservar identidad y resultados |
| [backend/docs/backend-5c/dependencias.json](../backend-5c/dependencias.json) | Evidence/contrato/plan; preservar identidad y resultados |
| [backend/docs/backend-5c/desarrollo-e2e.json](../backend-5c/desarrollo-e2e.json) | Evidence/contrato/plan; preservar identidad y resultados |
| [backend/docs/backend-5c/desarrollo-unit.json](../backend-5c/desarrollo-unit.json) | Evidence/contrato/plan; preservar identidad y resultados |
| [backend/docs/backend-5c/dry-run-after.jsonl](../backend-5c/dry-run-after.jsonl) | Evidence/contrato/plan; preservar identidad y resultados |
| [backend/docs/backend-5c/dry-run-before.jsonl](../backend-5c/dry-run-before.jsonl) | Evidence/contrato/plan; preservar identidad y resultados |
| [backend/docs/backend-5c/evidencia.json](../backend-5c/evidencia.json) | Evidence/contrato/plan; preservar identidad y resultados |
| [backend/docs/backend-5c/final-db-verify.jsonl](../backend-5c/final-db-verify.jsonl) | Evidence/contrato/plan; preservar identidad y resultados |
| [backend/docs/backend-5c/final-e2e.json](../backend-5c/final-e2e.json) | Evidence/contrato/plan; preservar identidad y resultados |
| [backend/docs/backend-5c/final-openapi-e2e.json](../backend-5c/final-openapi-e2e.json) | Evidence/contrato/plan; preservar identidad y resultados |
| [backend/docs/backend-5c/final-unit.json](../backend-5c/final-unit.json) | Evidence/contrato/plan; preservar identidad y resultados |
| [backend/docs/backend-5c/formatos-inspeccion.json](../backend-5c/formatos-inspeccion.json) | Evidence/contrato/plan; preservar identidad y resultados |
| [backend/docs/backend-5c/importacion-integral.json](../backend-5c/importacion-integral.json) | Evidence/contrato/plan; preservar identidad y resultados |
| [backend/docs/backend-5c/indexes.json](../backend-5c/indexes.json) | Evidence/contrato/plan; preservar identidad y resultados |
| [backend/docs/backend-5c/integridad.json](../backend-5c/integridad.json) | Evidence/contrato/plan; preservar identidad y resultados |
| [backend/docs/backend-5c/migration-plan.json](../backend-5c/migration-plan.json) | Evidence/contrato/plan; preservar identidad y resultados |
| [backend/docs/backend-5c/openapi.json](../backend-5c/openapi.json) | Evidence/contrato/plan; preservar identidad y resultados |
| [backend/docs/backend-5c/package-antes.json](../backend-5c/package-antes.json) | Evidence/contrato/plan; preservar identidad y resultados |
| [backend/docs/backend-5c/resumen.json](../backend-5c/resumen.json) | Evidence/contrato/plan; preservar identidad y resultados |
| [backend/docs/backend-5c/rollback.json](../backend-5c/rollback.json) | Evidence/contrato/plan; preservar identidad y resultados |
| [backend/docs/backend-5c/verificar-integridad.mjs](../backend-5c/verificar-integridad.mjs) | Herramienta integridad/generación; revisar alcance antes de ejecutar |
| [backend/docs/dashboard-baseline-e2e.json](../dashboard-baseline-e2e.json) | Evidence/contrato/plan; preservar identidad y resultados |
| [backend/docs/dashboard-baseline-unit.json](../dashboard-baseline-unit.json) | Evidence/contrato/plan; preservar identidad y resultados |
| [backend/docs/dashboard-db-dry-run.jsonl](../dashboard-db-dry-run.jsonl) | Evidence/contrato/plan; preservar identidad y resultados |
| [backend/docs/dashboard-db-verify.jsonl](../dashboard-db-verify.jsonl) | Evidence/contrato/plan; preservar identidad y resultados |
| [backend/docs/dashboard-e2e.json](../dashboard-e2e.json) | Evidence/contrato/plan; preservar identidad y resultados |
| [backend/docs/dashboard-evidencia.json](../dashboard-evidencia.json) | Evidence/contrato/plan; preservar identidad y resultados |
| [backend/docs/dashboard-integridad.json](../dashboard-integridad.json) | Evidence/contrato/plan; preservar identidad y resultados |
| [backend/docs/dashboard-reportes.postman_collection.json](../dashboard-reportes.postman_collection.json) | Colección API; revisar secrets antes de compartir |
| [backend/docs/dashboard-unit.json](../dashboard-unit.json) | Evidence/contrato/plan; preservar identidad y resultados |
| [backend/docs/devoluciones-db-dry-run.jsonl](../devoluciones-db-dry-run.jsonl) | Evidence/contrato/plan; preservar identidad y resultados |
| [backend/docs/devoluciones-db-verify.jsonl](../devoluciones-db-verify.jsonl) | Evidence/contrato/plan; preservar identidad y resultados |
| [backend/docs/devoluciones-e2e.json](../devoluciones-e2e.json) | Evidence/contrato/plan; preservar identidad y resultados |
| [backend/docs/devoluciones-integridad.json](../devoluciones-integridad.json) | Evidence/contrato/plan; preservar identidad y resultados |
| [backend/docs/devoluciones-unit.json](../devoluciones-unit.json) | Evidence/contrato/plan; preservar identidad y resultados |
| [backend/docs/devoluciones.postman_collection.json](../devoluciones.postman_collection.json) | Colección API; revisar secrets antes de compartir |
| [backend/docs/fixtures-sinteticos/clientes.csv](../fixtures-sinteticos/clientes.csv) | Fixture sintético; conservar/validar origen |
| [backend/docs/fixtures-sinteticos/precios-nueva-vigencia.csv](../fixtures-sinteticos/precios-nueva-vigencia.csv) | Fixture sintético; conservar/validar origen |
| [backend/docs/fixtures-sinteticos/precios.csv](../fixtures-sinteticos/precios.csv) | Fixture sintético; conservar/validar origen |
| [backend/docs/fixtures-sinteticos/precios.xlsx](../fixtures-sinteticos/precios.xlsx) | Fixture sintético; conservar/validar origen |
| [backend/docs/fixtures-sinteticos/productos.csv](../fixtures-sinteticos/productos.csv) | Fixture sintético; conservar/validar origen |
| [backend/docs/generar-guia-modulos.py](../generar-guia-modulos.py) | Herramienta integridad/generación; revisar alcance antes de ejecutar |
| [backend/docs/guia-modulos.html](../guia-modulos.html) | Guía exportada; artefacto derivado, conservar |
| [backend/docs/guia-modulos.pdf](../guia-modulos.pdf) | Guía exportada; artefacto derivado, conservar |
| [backend/docs/importaciones.postman_collection.json](../importaciones.postman_collection.json) | Colección API; revisar secrets antes de compartir |
| [backend/docs/listas-precios.postman_collection.json](../listas-precios.postman_collection.json) | Colección API; revisar secrets antes de compartir |
| [backend/docs/ventas.postman_collection.json](../ventas.postman_collection.json) | Colección API; revisar secrets antes de compartir |
| [backend/docs/verificar-api-integridad.mjs](../verificar-api-integridad.mjs) | Herramienta integridad/generación; revisar alcance antes de ejecutar |
| [backend/docs/verificar-devoluciones.mjs](../verificar-devoluciones.mjs) | Herramienta integridad/generación; revisar alcance antes de ejecutar |
| [backend/docs/verificar-integridad.mjs](../verificar-integridad.mjs) | Herramienta integridad/generación; revisar alcance antes de ejecutar |
| [backend/docs/verificar-swagger.mjs](../verificar-swagger.mjs) | Herramienta integridad/generación; revisar alcance antes de ejecutar |
| [backend/migrations/snapshots/6d75197f7d54105000e0db8f963af2a42673452a5dbe679dae9add1b85feea39/contract.d.ts](../../migrations/snapshots/6d75197f7d54105000e0db8f963af2a42673452a5dbe679dae9add1b85feea39/contract.d.ts) | Snapshot contrato; conservar/comparar hash y ref |
| [backend/migrations/snapshots/6d75197f7d54105000e0db8f963af2a42673452a5dbe679dae9add1b85feea39/contract.json](../../migrations/snapshots/6d75197f7d54105000e0db8f963af2a42673452a5dbe679dae9add1b85feea39/contract.json) | Snapshot contrato; conservar/comparar hash y ref |
| [backend/migrations/snapshots/b78d79ccbcabf28fdf4dba47579f2629edb1ed96518efc6fb2624f015a289793/contract.d.ts](../../migrations/snapshots/b78d79ccbcabf28fdf4dba47579f2629edb1ed96518efc6fb2624f015a289793/contract.d.ts) | Snapshot contrato; conservar/comparar hash y ref |
| [backend/migrations/snapshots/b78d79ccbcabf28fdf4dba47579f2629edb1ed96518efc6fb2624f015a289793/contract.json](../../migrations/snapshots/b78d79ccbcabf28fdf4dba47579f2629edb1ed96518efc6fb2624f015a289793/contract.json) | Snapshot contrato; conservar/comparar hash y ref |
| [backend/migrations/snapshots/b9a8807046b84f126ed0a60ee96eec34330e8d6f608df0da2277662a796c4cc8/contract.d.ts](../../migrations/snapshots/b9a8807046b84f126ed0a60ee96eec34330e8d6f608df0da2277662a796c4cc8/contract.d.ts) | Snapshot contrato; conservar/comparar hash y ref |
| [backend/migrations/snapshots/b9a8807046b84f126ed0a60ee96eec34330e8d6f608df0da2277662a796c4cc8/contract.json](../../migrations/snapshots/b9a8807046b84f126ed0a60ee96eec34330e8d6f608df0da2277662a796c4cc8/contract.json) | Snapshot contrato; conservar/comparar hash y ref |
| [backend/migrations/snapshots/d3361dc82e881fecf6ae6556bfe9fbc9ce131b5d2f3aae753c6c34c9d0ce6911/contract.d.ts](../../migrations/snapshots/d3361dc82e881fecf6ae6556bfe9fbc9ce131b5d2f3aae753c6c34c9d0ce6911/contract.d.ts) | Snapshot contrato; conservar/comparar hash y ref |
| [backend/migrations/snapshots/d3361dc82e881fecf6ae6556bfe9fbc9ce131b5d2f3aae753c6c34c9d0ce6911/contract.json](../../migrations/snapshots/d3361dc82e881fecf6ae6556bfe9fbc9ce131b5d2f3aae753c6c34c9d0ce6911/contract.json) | Snapshot contrato; conservar/comparar hash y ref |
| [backend/migrations/snapshots/db41c5fbcbec46dea1641008cb39379a18bfee57ff707cb94f34ea1b0fda1284/contract.d.ts](../../migrations/snapshots/db41c5fbcbec46dea1641008cb39379a18bfee57ff707cb94f34ea1b0fda1284/contract.d.ts) | Snapshot contrato; conservar/comparar hash y ref |
| [backend/migrations/snapshots/db41c5fbcbec46dea1641008cb39379a18bfee57ff707cb94f34ea1b0fda1284/contract.json](../../migrations/snapshots/db41c5fbcbec46dea1641008cb39379a18bfee57ff707cb94f34ea1b0fda1284/contract.json) | Snapshot contrato; conservar/comparar hash y ref |

No versionar masivamente evidence/ZIP sin revisión secrets/PII/tamaño/origen. JSON fallidos/intermedios útiles junto a cierre final. Scripts locales de integridad no autorizados automáticamente para producción. Snapshot/ref actual requiere revisión de versionado por dependencia estructural.

## Prioridades

1. Migraciones formales/CD/TLS/backup-restore antes de producción.
2. Retención evidence y política de privacidad/observabilidad.
3. Revocación JWT/protección login/exposición Swagger.
4. Deploy/verify EXCLUDE y manifest pareja SHA/digests.
5. Actions/dependencias deprecated en PR separado recertificado.
6. Siete warnings con semántica preservada y revisión untracked.

No se corrigió código funcional.
