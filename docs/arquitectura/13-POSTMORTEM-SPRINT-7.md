# Postmortem Sprint 7

Auditoría 2026-10-07 · Backend `4189fa483ecbbed242946cefc6d4282e0e13dfe8` · Frontend `be0f12e0bf48d6df05afb1eced092b34c915e1cf`.

[Índice](00-README.md) · [Documento maestro](../ARQUITECTURA-INVENTARIO.md)

## Contenido

- [Alcance](#alcance)
- [Ejecuciones](#ejecuciones)
- [Incidentes](#incidentes)
- [Local frente a CI](#local-frente-a-ci)
- [Prevención propuesta](#prevención-propuesta)
- [Fuentes](#fuentes)

## Alcance

Hechos reconstruidos de commits/logs/artifacts GitHub y código. No atribuir toda cancelación a fallo de código ni inferir causa única sin prueba. Crudos descargados /tmp y hechos saneados, sin registros reales.

## Ejecuciones


| Run | Commit | Resultado |
| --- | --- | --- |
| [37659945147](https://github.com/Dennis9901/inventario_back/actions/runs/37659945147) | c2f9486 | failure |
| [37661032239](https://github.com/Dennis9901/inventario_back/actions/runs/37661032239) | 3c8a42f | failure |
| [37665087792](https://github.com/Dennis9901/inventario_back/actions/runs/37665087792) | 397c9d5 | failure |
| [37666861682](https://github.com/Dennis9901/inventario_back/actions/runs/37666861682) | e7f5b6c | failure |
| [37673333614](https://github.com/Dennis9901/inventario_back/actions/runs/37673333614) | 5600978 | cancelled |
| [37679392828](https://github.com/Dennis9901/inventario_back/actions/runs/37679392828) | 4189fa4 | success |

## Incidentes

### OpenAPI cross-repository

| Campo | Detalle |
| --- | --- |
| Síntoma | contracts ENOENT docs/api-openapi.json, run 37659945147 |
| Causa raíz | Snapshot local no versionado |
| Diagnóstico | Log contracts + ci-contracts/git ls-files |
| Solución | Versionar snapshot backend |
| Commit | 3c8a42f |
| Validación posterior | contracts success final |
| Lección aprendida | Versionar todo input obligatorio |

### Frontend public ausente

| Campo | Detalle |
| --- | --- |
| Síntoma | BuildKit /public not found, run 37659945147 |
| Causa raíz | Directorio vacío local no se conserva en Git |
| Diagnóstico | COPY public/contexto/commit frontend |
| Solución | public/.gitkeep versionado |
| Commit | be0f12e frontend |
| Validación posterior | Docker success con esa revisión |
| Lección aprendida | Directorio local no garantiza checkout |

### Script garantías tools

| Campo | Detalle |
| --- | --- |
| Síntoma | BuildKit aplicar-garantias.mjs not found, run 37661032239 |
| Causa raíz | COPY requería archivo untracked |
| Diagnóstico | Dockerfile/whitelist/Git/log |
| Solución | Versionar script; whitelist ya estaba |
| Commit | 397c9d5 |
| Validación posterior | Build tools/validation success final |
| Lección aprendida | Herramienta administrativa en docs es input operativo |

### garantias.sql

| Campo | Detalle |
| --- | --- |
| Síntoma | ENOENT en ambos E2E, run 37665087792 |
| Causa raíz | Lifecycle lee SQL no versionado |
| Diagnóstico | Create PostgreSQL log y lectura script |
| Solución | Versionar garantía SQL |
| Commit | e7f5b6c |
| Validación posterior | Schema E2E success final |
| Lección aprendida | Tools script embebido y E2E SQL son dependencias distintas |

### Directorios evidence

| Campo | Detalle |
| --- | --- |
| Síntoma | 312 total/310 passed/2 failed, run 37666861682 ci-1 |
| Causa raíz | writeFile no crea docs/backend-5a/5c |
| Diagnóstico | Artifact confirma dos ENOENT; git show |
| Solución | mkdir recursive antes de writeFile |
| Commit | 5600978 |
| Validación posterior | 312/312 cada ciclo final |
| Lección aprendida | Prueba debe crear destino evidence |

### Playwright --with-deps

| Campo | Detalle |
| --- | --- |
| Síntoma | Instalación paquetes OS/timeouts/proceso huérfano en run 37666861682 |
| Causa raíz | --with-deps agrega apt/dependencias de sistema; no demuestra toda causa de cancelación |
| Diagnóstico | Logs Chromium/tiempos/diff |
| Solución | npx playwright install chromium en dos pasos backend YAML |
| Commit | 4189fa4 |
| Validación posterior | Chromium/Docker/E2E success final |
| Lección aprendida | Separar browser de preparación OS y recertificar runner |

### Docker cancelled / E2E skipped

| Campo | Detalle |
| --- | --- |
| Síntoma | Run 37673333614 docker cancelled, E2E skipped, certification failure |
| Causa raíz | Dependencias necesitan success; motivo exacto cancelación no demostrado por status |
| Diagnóstico | API jobs y needs YAML |
| Solución | Nueva ejecución estable tras fix Playwright |
| Commit | 4189fa4 validación posterior |
| Validación posterior | Todos gates success final |
| Lección aprendida | Skipped/cancelled no son aprobación |

### Estabilización final

| Campo | Detalle |
| --- | --- |
| Síntoma | Runs failure/cancelled antes de baseline |
| Causa raíz | Clon limpio expuso inputs locales y preparación no reproducible |
| Diagnóstico | Serie Git/logs/artifacts/pareja SHA |
| Solución | Versionar inputs, mkdir e instalación acotada |
| Commit | 4189fa4 y antecedentes |
| Validación posterior | Run 37679392828 success |
| Lección aprendida | Reproducibilidad incluye entorno/contexto/evidence |

## Local frente a CI

Checkout sólo tracked; Docker filtra también contexto/dockerignore. Public frontend, script tools y SQL E2E no son un único defecto dockerignore. 397c9d5 añadió archivo, no cambió whitelist existente. 5600978 crea sólo destinos evidence. No alterar historia de intentos fallidos.

## Prevención propuesta

Clon limpio, build todos targets, inputs operativos versionados, mkdir en pruebas, validators estrictos, manifest pareja SHA y archivo duradero evidence. No se aplicó fix funcional aquí.

## Fuentes

- [backend/.github/workflows/ci.yml](../../.github/workflows/ci.yml)
- [backend/Dockerfile](../../Dockerfile)
- [backend/.dockerignore](../../.dockerignore)
- [backend/test/backend-5a.e2e-spec.ts](../../test/backend-5a.e2e-spec.ts)
- [backend/test/backend-5c.e2e-spec.ts](../../test/backend-5c.e2e-spec.ts)
- [backend/docs/backend-5b/aplicar-garantias.mjs](../backend-5b/aplicar-garantias.mjs)
- [backend/docs/backend-5b/garantias.sql](../backend-5b/garantias.sql)

[frontend/public/.gitkeep](../../../inventario_front/public/.gitkeep)
