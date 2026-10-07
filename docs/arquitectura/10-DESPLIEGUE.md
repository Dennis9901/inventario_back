# Despliegue y rollback

Auditoría 2026-10-07 · Backend `4189fa483ecbbed242946cefc6d4282e0e13dfe8` · Frontend `be0f12e0bf48d6df05afb1eced092b34c915e1cf`.

[Índice](00-README.md) · [Documento maestro](../ARQUITECTURA-INVENTARIO.md)

## Contenido

- [ESTADO ACTUAL](#estado-actual)
- [PROPUESTA DE DESPLIEGUE PRODUCTIVO](#propuesta-de-despliegue-productivo)
- [Variables, secretos y PostgreSQL](#variables-secretos-y-postgresql)
- [Migración y backups](#migración-y-backups)
- [Health, logs y observabilidad](#health-logs-y-observabilidad)
- [Rollback de aplicación y DB](#rollback-de-aplicación-y-db)
- [Fuentes](#fuentes)

## ESTADO ACTUAL

Desarrollo/build/tests, Docker multistage, Compose productivo-local, gateway y CI/E2E remoto certificados. **No se encontró deploy productivo automatizado, publicación a registry, configuración real host/cloud/TLS ni backup/restore implementado.** npm deploy nest deploy no demuestra destino real ni uso de Prisma Platform/Composer.

```mermaid
flowchart LR
  Dev[Desarrollo] --> Build[Build/tests]
  Build --> Docker[Imágenes]
  Docker --> CI[Gates CI]
  CI --> E2E[ci-1 y ci-2]
  E2E --> Cert[Certificación]
  Cert -. propuesto .-> Registry[Registry/digest]
  Registry -. propuesto .-> Stage[Staging/aprobación]
  Stage -. propuesto .-> Prod[Producción]
```

Hoy se puede operar Compose local con frontend localhost, DB red interna y volumen. No se confirmó un servicio público que lo utilice. Verify de arranque no migra BD existente.

## PROPUESTA DE DESPLIEGUE PRODUCTIVO

Diseño pendiente de implementación:

1. Elegir host/orquestador/DB, responsables, ventana y RPO/RTO.
2. Certificar pareja SHA y plan DB; archivar evidence fuera de retención efímera.
3. Publicar runtime/tools por digest inmutable, escanear y registrar procedencia; promover misma imagen sin reconstruir branch flotante.
4. Staging aislado con TLS/secrets y prueba de replay migración/EXCLUDE.
5. Backup consistente y restauración ensayada antes de release; registrar storageHash/constraints.
6. Aplicación administrativa única de migraciones con DDL separado; verificar contrato y garantía externa.
7. Desplegar imágenes certificadas, health/readiness y smoke autenticado; coordinar mantenimiento si cambia compatibilidad.
8. Observar latencia/5xx/audit_failure/integridad antes de cierre.

## Variables, secretos y PostgreSQL

DATABASE_URL o DB_HOST/PORT/NAME/USER/PASSWORD por entrypoint; JWT_SECRET/EXPIRES_IN, PORT, CORS_ORIGINS e IMPORT_* según necesidad. _FILE/secrets manager productivo; no valores en evidence. Frontend API relativa y API_UPSTREAM gateway, sin secretos bundle.

Rol DB runtime mínimo DML y migraciones DDL separado. Alta inicial segura real por diseñar; seed-local sólo sintético. Rotar JWT_SECRET invalida todos tokens; planear efecto.

## Migración y backups

Bootstrap actual BD Compose vacía solamente; crear grafo formal antes de entorno compartido. EXCLUDE explícita, datos preexistentes compatibles y definición comprobada. Expansión/contracción para cambios: compatibilidad primero, retirada posterior revisada. No down migrations disponibles.

Proponer pg_dump/backup administrado cifrado y restore aislado ensayado; lógico no equivale PITR. Snapshot Prisma sólo estructura. Recuperación puede perder escrituras después del backup; negocio debe decidir RPO/reconciliación.

## Health, logs y observabilidad

/api/v1/health liveness; /health/ready SELECT 1 con timeout, no integridad; gateway /healthz sólo Nginx. RequestId/log estructurado/Auditoria existen. Agregación logs, métricas/alertas/traces y retención centralizada productiva pendientes.

## Rollback de aplicación y DB

Propuesta: manifest pareja SHA/digests/storageHash/variables sin valores y conservar imágenes previas. Pausar release, comprobar esquema compatible y desplegar digest anterior, health/smoke/logs. Tags locales phase2a mutables no dan rollback exacto sin conservar imágenes/manifiesto.

Git revert no restaura despliegue/DB. No borrar volumen ni aplicar contrato antiguo db update como downgrade automático. Preferir migración compensatoria compatible; restore sólo autorizado/ensayado con tratamiento de escrituras posteriores. No hay comando productivo único existente.

## Fuentes

- [backend/.github/workflows/ci.yml](../../.github/workflows/ci.yml)
- [backend/docker/entrypoint.mjs](../../docker/entrypoint.mjs)
- [backend/migrations/app/refs/db.json](../../migrations/app/refs/db.json)

[frontend/docker-compose.prod.yml](../../../inventario_front/docker-compose.prod.yml)

[frontend/docs/sprint-7/FASE-2A-DOCKER-PRODUCCION.md](../../../inventario_front/docs/sprint-7/FASE-2A-DOCKER-PRODUCCION.md)
