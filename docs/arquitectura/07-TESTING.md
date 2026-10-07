# Estrategia y evidencia de pruebas

Auditoría 2026-10-07 · Backend `4189fa483ecbbed242946cefc6d4282e0e13dfe8` · Frontend `be0f12e0bf48d6df05afb1eced092b34c915e1cf`.

[Índice](00-README.md) · [Documento maestro](../ARQUITECTURA-INVENTARIO.md)

## Contenido

- [Estrategia real](#estrategia-real)
- [Backend 5A, 5B, 5C](#backend-5a-5b-5c)
- [Cifras históricas](#cifras-históricas)
- [Certificación remota comprobada](#certificación-remota-comprobada)
- [Fallo anterior 310 de 312](#fallo-anterior-310-de-312)
- [Lifecycle seguro y evidencia](#lifecycle-seguro-y-evidencia)
- [Verificaciones nuevas de auditoría](#verificaciones-nuevas-de-auditoría)
- [Inventario de suites certificadas](#inventario-de-suites-certificadas)
- [Fuentes](#fuentes)

## Estrategia real

| Nivel | Herramienta/ubicación | Objetivo |
| --- | --- | --- |
| Unit backend | Vitest, src/**/*.spec.ts | DTO/cálculos/servicios/infraestructura y dobles |
| Unit frontend | Vitest Angular HttpTestingController | Formularios/estado/servicios/errores |
| Integración API | Vitest/Nest Testing/Supertest/PostgreSQL, test/*.e2e-spec.ts | HTTP/FK/CHECK/atomicidad/concurrencia |
| Orquestación/componentes | node tests en frontend/scripts/tests | Lifecycle y protecciones |
| Contratos | Generator/deep equality/Swagger assertions | Snapshots/tipos/esquemas |
| Browser | Playwright Chromium frontend/e2e | Flujos comerciales y responsive |
| Docker/gateway | Build 3 imágenes y validation representativa | Routing/cache/seguridad/readiness |
| Integridad/evidence | SQL/verificadores/ledgers/business | Saldos/snapshots/constraints/residuos/cleanup |

Backend unit config incluye **/*.spec.ts; integración **/*.e2e-spec.ts. Suites DB usan describe.runIf(TEST_INVENTARIO_DB === '1'); una ejecución skipped no certifica DB. Frontend Vitest node con setup/contexto Angular, no DOM browser general. Playwright un worker/no fullyParallel, timeout 120s/expect 15s, retries 0, forbidOnly CI, screenshots/traces al fallar.

## Backend 5A, 5B, 5C

| Fase | Qué comprobaba |
| --- | --- |
| 5A | Cliente fiscal opcional/domicilio, unidades/SAT legacy, normalización/FK/UNIQUE, roles/auditoría/snapshots/OpenAPI |
| 5B | Listas/vigencias/fallback, única predeterminada, EXCLUDE SQL/HTTP concurrente, locks, snapshot histórico/devolución y stock/reportes |
| 5C | CSV/XLSX clientes/productos/precios, hashes/mappings, preview obsoleto, formatos peligrosos, atomicidad/doble confirmación y privacidad |

## Cifras históricas

Extracción JSON local preexistente; ejecuciones acumuladas diferentes, no sumar como cobertura única ni presentarlas como ejecución nueva.


| Fase | Reporte | Total | Passed | Failed | Pending | Evidencia |
| --- | --- | --- | --- | --- | --- | --- |
| backend-5a | baseline-unit | 461 | 461 | 0 | 0 | [backend/docs/backend-5a/baseline-unit.json](../backend-5a/baseline-unit.json) |
| backend-5a | final-unit | 480 | 480 | 0 | 0 | [backend/docs/backend-5a/final-unit.json](../backend-5a/final-unit.json) |
| backend-5a | baseline-e2e | 238 | 238 | 0 | 0 | [backend/docs/backend-5a/baseline-e2e.json](../backend-5a/baseline-e2e.json) |
| backend-5a | final-e2e | 249 | 249 | 0 | 0 | [backend/docs/backend-5a/final-e2e.json](../backend-5a/final-e2e.json) |
| backend-5b | baseline-unit | 480 | 480 | 0 | 0 | [backend/docs/backend-5b/baseline-unit.json](../backend-5b/baseline-unit.json) |
| backend-5b | final-unit | 507 | 507 | 0 | 0 | [backend/docs/backend-5b/final-unit.json](../backend-5b/final-unit.json) |
| backend-5b | baseline-e2e | 249 | 249 | 0 | 0 | [backend/docs/backend-5b/baseline-e2e.json](../backend-5b/baseline-e2e.json) |
| backend-5b | final-e2e | 277 | 277 | 0 | 0 | [backend/docs/backend-5b/final-e2e.json](../backend-5b/final-e2e.json) |
| backend-5c | baseline-unit | 507 | 507 | 0 | 0 | [backend/docs/backend-5c/baseline-unit.json](../backend-5c/baseline-unit.json) |
| backend-5c | final-unit | 561 | 561 | 0 | 0 | [backend/docs/backend-5c/final-unit.json](../backend-5c/final-unit.json) |
| backend-5c | baseline-e2e | 277 | 276 | 1 | 0 | [backend/docs/backend-5c/baseline-e2e.json](../backend-5c/baseline-e2e.json) |
| backend-5c | final-e2e | 312 | 312 | 0 | 0 | [backend/docs/backend-5c/final-e2e.json](../backend-5c/final-e2e.json) |

Baseline E2E 5C **277/276/1 failed**: conservar intento fallido aunque cierre 312/312. 5A también conserva unit intermedio 460/461. Reportes narrativos no sustituyen identidad de la ejecución JSON.

## Certificación remota comprobada

[Run 37679392828](https://github.com/Dennis9901/inventario_back/actions/runs/37679392828), API/logs y artifacts leídos:

| Gate | Resultado |
| --- | --- |
| Backend unit | 567/567, 0 failed/pending |
| Frontend unit | 450/450, 0 failed/pending |
| Docker browser | 3 expected, 0 unexpected/flaky/skipped |
| Integración ci-1/ci-2 | 312/312 cada ciclo |
| Browser ci-1/ci-2 | 26 expected, 0 unexpected/flaky, 1 skipped cada ciclo |
| Business/destrucción/upload | success ambos ciclos |

Skipped exacto: optional real read-only account rejects administrative deep link. ci-results --allow-reader permite máximo uno de ese título, no cualquier skipped; rechaza retries/flaky. CI verde no significa cero skipped browser.

## Fallo anterior 310 de 312

Artifact e2e-ci-1-1/fase-1/ci-1/backend-integration.json del [run 37666861682](https://github.com/Dennis9901/inventario_back/actions/runs/37666861682): 312 total/310 passed/2 failed. ENOENT docs/backend-5a/openapi.json y docs/backend-5c/openapi.json. git show 5600978 confirma mkdir recursive antes de writeFile. Run final 312/312 por ciclo confirma solución; no eran fallos de reglas comerciales.

## Lifecycle seguro y evidencia

Orquestación principalmente en frontend/scripts; **backend no tiene scripts/**. Lifecycle crea PostgreSQL 17 tmpfs, contenedor inventario-s6-postgres, DB inventario_e2e_s6/usuario dedicado, localhost:55432, labels/identidad y secretos sintéticos. Aplica contrato y garantias.sql; seed sintético y verifica propiedad. e2e-run --integration lanza suites/servidores/gateway/browser y comprueba proceso/DB.

ci-cleanup verifica destrucción propia; no borrar recursos desconocidos. TEST_INVENTARIO_DB=1 puede crear fixtures e inducir DDL/fallos: nunca ejecutar contra DB compartida/productiva sólo por tener bandera test.

Evidence: Vitest/Playwright JSON, logs saneados, capturas/trace/ledgers, contratos antes/después, constraints/índices y verify/dry-run. Conservar origen/SHA/run y resultados fallidos. Artifacts de diagnóstico CI expiran en 7 días; certificación se conserva 30 días; archive seguro requerido para auditoría duradera. Crudos sólo /tmp, no publicados aquí.

## Verificaciones nuevas de auditoría

TypeScript sin emisión/incremental aprobado, lint exit 0 con 7 warnings y unit backend 567/567. No recertificación local frontend/integración; builds y pruebas se comprobaron en run remoto. No porcentaje de coverage inventado: test:cov existe pero no se ejecutó.

## Inventario de suites certificadas

Conteo de assertionResults por archivo del artifact certificado. ci-2 repite integración con reporte separado; no duplicar tests al sumar suite lógica.

| Nivel | Archivo | Assertions | Passed |
| --- | --- | --- | --- |
| Backend unit | app.controller.spec.ts | 1 | 1 |
| Backend unit | infraestructura.spec.ts | 43 | 43 |
| Backend unit | categorias.service.spec.ts | 6 | 6 |
| Backend unit | dinero.spec.ts | 14 | 14 |
| Backend unit | calculos.spec.ts | 43 | 43 |
| Backend unit | dashboard.service.spec.ts | 16 | 16 |
| Backend unit | reglas.spec.ts | 13 | 13 |
| Backend unit | productos.service.spec.ts | 18 | 18 |
| Backend unit | dinero-venta.spec.ts | 16 | 16 |
| Backend unit | backend-5a.dto.spec.ts | 19 | 19 |
| Backend unit | compras.dto.spec.ts | 35 | 35 |
| Backend unit | devoluciones.dto.spec.ts | 92 | 92 |
| Backend unit | parsers.spec.ts | 54 | 54 |
| Backend unit | consulta-inventario.dto.spec.ts | 25 | 25 |
| Backend unit | inventario.dto.spec.ts | 54 | 54 |
| Backend unit | listas-precios.dto.spec.ts | 27 | 27 |
| Backend unit | producto.dto.spec.ts | 37 | 37 |
| Backend unit | ventas.dto.spec.ts | 54 | 54 |
| Frontend unit | contract-smoke.spec.ts | 1 | 1 |
| Frontend unit | sprint-2-architecture.spec.ts | 1 | 1 |
| Frontend unit | sprint-3-routes.spec.ts | 1 | 1 |
| Frontend unit | sprint-4-routes.spec.ts | 1 | 1 |
| Frontend unit | sprint-5-routes.spec.ts | 8 | 8 |
| Frontend unit | sprint-6-fallback.spec.ts | 2 | 2 |
| Frontend unit | sprint-6-hardening.spec.ts | 8 | 8 |
| Frontend unit | auth.store.spec.ts | 6 | 6 |
| Frontend unit | token-storage.service.spec.ts | 4 | 4 |
| Frontend unit | auth.guard.spec.ts | 5 | 5 |
| Frontend unit | api-error.spec.ts | 2 | 2 |
| Frontend unit | api.interceptor.spec.ts | 12 | 12 |
| Frontend unit | login.component.spec.ts | 4 | 4 |
| Frontend unit | catalogos.component.spec.ts | 49 | 49 |
| Frontend unit | sprint-5-catalogos.spec.ts | 14 | 14 |
| Frontend unit | compra-editor.component.spec.ts | 12 | 12 |
| Frontend unit | compra-form.spec.ts | 23 | 23 |
| Frontend unit | compras.spec.ts | 26 | 26 |
| Frontend unit | dashboard.service.spec.ts | 2 | 2 |
| Frontend unit | devolucion-detalle.component.spec.ts | 4 | 4 |
| Frontend unit | devolucion-editor.component.spec.ts | 32 | 32 |
| Frontend unit | devolucion-form.spec.ts | 26 | 26 |
| Frontend unit | devoluciones.component.spec.ts | 6 | 6 |
| Frontend unit | devoluciones.facade.spec.ts | 46 | 46 |
| Frontend unit | devoluciones.service.spec.ts | 10 | 10 |
| Frontend unit | importaciones.spec.ts | 27 | 27 |
| Frontend unit | kardex-dialog.component.spec.ts | 2 | 2 |
| Frontend unit | movimiento-editor.component.spec.ts | 4 | 4 |
| Frontend unit | movimiento-form.spec.ts | 4 | 4 |
| Frontend unit | movimientos.facade.spec.ts | 1 | 1 |
| Frontend unit | movimientos.service.spec.ts | 5 | 5 |
| Frontend unit | listas-precios.spec.ts | 9 | 9 |
| Frontend unit | producto-editor.component.spec.ts | 3 | 3 |
| Frontend unit | producto-form.spec.ts | 2 | 2 |
| Frontend unit | productos.component.spec.ts | 1 | 1 |
| Frontend unit | productos.facade.spec.ts | 1 | 1 |
| Frontend unit | productos.service.spec.ts | 5 | 5 |
| Frontend unit | sprint-5-productos.spec.ts | 4 | 4 |
| Frontend unit | venta-detalle.component.spec.ts | 2 | 2 |
| Frontend unit | venta-disponibilidad.spec.ts | 4 | 4 |
| Frontend unit | venta-editor.component.spec.ts | 19 | 19 |
| Frontend unit | venta-form.spec.ts | 17 | 17 |
| Frontend unit | ventas.component.spec.ts | 3 | 3 |
| Frontend unit | ventas.spec.ts | 29 | 29 |
| Frontend unit | pagination.component.spec.ts | 1 | 1 |
| Frontend unit | format.spec.ts | 2 | 2 |
| Backend integración ci-1 | api-infraestructura.e2e-spec.ts | 32 | 32 |
| Backend integración ci-1 | app.e2e-spec.ts | 1 | 1 |
| Backend integración ci-1 | backend-5a.e2e-spec.ts | 11 | 11 |
| Backend integración ci-1 | backend-5b.e2e-spec.ts | 28 | 28 |
| Backend integración ci-1 | backend-5c.e2e-spec.ts | 35 | 35 |
| Backend integración ci-1 | compras.e2e-spec.ts | 33 | 33 |
| Backend integración ci-1 | dashboard-reportes.e2e-spec.ts | 46 | 46 |
| Backend integración ci-1 | devoluciones.e2e-spec.ts | 67 | 67 |
| Backend integración ci-1 | inventario.e2e-spec.ts | 19 | 19 |
| Backend integración ci-1 | ventas.e2e-spec.ts | 40 | 40 |


## Fuentes

- [backend/vitest.config.ts](../../vitest.config.ts)
- [backend/vitest.config.e2e.ts](../../vitest.config.e2e.ts)
- [backend/test/backend-5a.e2e-spec.ts](../../test/backend-5a.e2e-spec.ts)
- [backend/test/backend-5b.e2e-spec.ts](../../test/backend-5b.e2e-spec.ts)
- [backend/test/backend-5c.e2e-spec.ts](../../test/backend-5c.e2e-spec.ts)
- [backend/docs/VALIDACION-BACKEND-5A.md](../VALIDACION-BACKEND-5A.md)
- [backend/docs/VALIDACION-BACKEND-5B.md](../VALIDACION-BACKEND-5B.md)
- [backend/docs/VALIDACION-BACKEND-5C.md](../VALIDACION-BACKEND-5C.md)

[frontend/playwright.config.mjs](../../../inventario_front/playwright.config.mjs)

[frontend/scripts/ci-results.mjs](../../../inventario_front/scripts/ci-results.mjs)
