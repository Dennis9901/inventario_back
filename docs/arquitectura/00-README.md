# Guía de lectura y alcance

Auditoría 2026-10-07 · Backend `4189fa483ecbbed242946cefc6d4282e0e13dfe8` · Frontend `be0f12e0bf48d6df05afb1eced092b34c915e1cf`.

[Índice](00-README.md) · [Documento maestro](../ARQUITECTURA-INVENTARIO.md)

## Contenido

- [Propósito y autoridad](#propósito-y-autoridad)
- [Mapa documental](#mapa-documental)
- [Lectura por responsabilidad](#lectura-por-responsabilidad)
- [Método y límites](#método-y-límites)
- [Conservación y mantenimiento](#conservación-y-mantenimiento)
- [Resultado del control de calidad](#resultado-del-control-de-calidad)

## Propósito y autoridad

Documentación oficial de referencia para incorporación, mantenimiento, QA, soporte y operación. Describe todo el sistema, incluidas fases previas al Sprint 7. Los hechos se separan de historia e inferencias y las propuestas se identifican explícitamente.

El SHA backend indicado arriba es el **BASELINE VERDE / CERTIFICADO DEL SPRINT 7**. GitHub confirma [run 37679392828](https://github.com/Dennis9901/inventario_back/actions/runs/37679392828) completed/success con frontend fijado a be0f12e0bf48d6df05afb1eced092b34c915e1cf. Certifica esa pareja y sus gates, no una instalación productiva.

## Mapa documental


| Documento | Alcance |
| --- | --- |
| [Arquitectura general e historia](01-ARQUITECTURA-GENERAL.md) | Arquitectura general e historia |
| [Entorno de desarrollo](02-ENTORNO-DESARROLLO.md) | Entorno de desarrollo |
| [PostgreSQL y Prisma](03-BASE-DATOS.md) | PostgreSQL y Prisma |
| [Backend NestJS](04-BACKEND.md) | Backend NestJS |
| [Frontend Angular](05-FRONTEND.md) | Frontend Angular |
| [Seguridad](06-SEGURIDAD.md) | Seguridad |
| [Estrategia y evidencia de pruebas](07-TESTING.md) | Estrategia y evidencia de pruebas |
| [Docker y ejecución](08-DOCKER.md) | Docker y ejecución |
| [CI y certificación](09-CI-CD.md) | CI y certificación |
| [Despliegue y rollback](10-DESPLIEGUE.md) | Despliegue y rollback |
| [Flujo Git propuesto](11-GIT-WORKFLOW.md) | Flujo Git propuesto |
| [Runbook operativo](12-RUNBOOK.md) | Runbook operativo |
| [Postmortem Sprint 7](13-POSTMORTEM-SPRINT-7.md) | Postmortem Sprint 7 |
| [Hallazgos y deuda técnica](14-DEUDA-TECNICA.md) | Hallazgos y deuda técnica |
| [Checklist de release](15-CHECKLIST-RELEASE.md) | Checklist de release |

## Lectura por responsabilidad

| Perfil | Orden recomendado |
| --- | --- |
| Desarrollo | Arquitectura, entorno, datos, backend/frontend, testing |
| DevOps | Datos, Docker, CI, despliegue, runbook, deuda |
| QA | Endpoints, rutas, testing, postmortem, checklist |
| Soporte | Runbook, seguridad/observabilidad, estados de negocio |
| Auditoría | Historia, fuentes, certificación, evidencias, deuda |

## Método y límites

Se inventariaron ambos repositorios, incluidos tracked/untracked, manifests/lockfiles, configuraciones, contrato/snapshots, módulos/controllers/servicios/DTO, frontend, scripts, tests, Docker, workflows y documentación/evidencia. Se consultaron Git y GitHub en lectura; artifacts se descargaron sólo a /tmp para extraer resultados saneados.

Los valores de .env no se reproducen; archivos comerciales/binarios se clasifican sin copiar registros reales. No se consultó ninguna BD existente: las definiciones PostgreSQL provienen del contrato y evidencias previas. No se afirma verificación actual del esquema productivo.

Verificaciones locales nuevas: tsc backend sin emisión/incremental, lint backend y 567/567 unitarias con URL DB sintética inaccesible y TEST_INVENTARIO_DB=0. No se ejecutaron integración mutante, bootstrap, migraciones ni cleanup. Nest configura deleteOutDir true: no se volvió a ejecutar build para respetar la prohibición de eliminar archivos; builds/backend/frontend se comprobaron en el run remoto y sus artifacts.

## Conservación y mantenimiento

Untracked no significa basura. La clasificación de cada evidencia/documento y los snapshots está en deuda técnica y base de datos. Estos documentos quedan locales, sin staging/commit/push ni modificación de refs. Actualizar al cambiar endpoints, roles, contrato, scripts, CI o despliegue. Conservar siempre pareja SHA, run y origen de evidencia.

## Resultado del control de calidad

| Control | Resultado de esta auditoría |
| --- | --- |
| Documentos requeridos | 17 creados: maestro y 16 capítulos |
| Endpoints | 117 operaciones/85 rutas; igualdad de rutas y métodos código/OpenAPI |
| Autorización | Decoradores método/clase y guards extraídos del código |
| Modelo de datos | 23 tablas y diccionario columnas/PK/FK/UNIQUE/CHECK/índices del contrato |
| Scripts | Todos los npm run documentados existen en manifests inspeccionados |
| CI | Dependencias/triggers/variables/artifacts y retención 7/30 días contrastados con YAML |
| Git y runs | Commits comprobados; baseline remoto/artifacts verificados |
| Enlaces | Referencias relativas y anclas comprobadas, sin destino inexistente |
| Whitespace | git diff --check y check no-index por cada documento nuevo, sin errores |
| Secretos | Sin coincidencias con valores sensibles de env local ni JWT/credenciales incluidos |
| Preservación | Hashes de archivos preexistentes sin cambios en ambos repositorios; diff tracked/cached vacíos |
| Pruebas nuevas | Tsc backend aprobado, lint exit 0/7 warnings, unit 567/567 |

No se ejecutaron builds con limpieza de salida ni operaciones DB/DDL. Las propuestas de producción y los comandos de cambios Git/rollback son documentación para autorización futura, no acciones realizadas.
