# Runbook operativo

Auditoría 2026-10-07 · Backend `4189fa483ecbbed242946cefc6d4282e0e13dfe8` · Frontend `be0f12e0bf48d6df05afb1eced092b34c915e1cf`.

[Índice](00-README.md) · [Documento maestro](../ARQUITECTURA-INVENTARIO.md)

## Contenido

- [Alcance operativo](#alcance-operativo)
- [Instalación y desarrollo](#instalación-y-desarrollo)
- [Compilar, lint y unitarias](#compilar-lint-y-unitarias)
- [Integración y E2E aislados](#integración-y-e2e-aislados)
- [Docker y CI local parcial](#docker-y-ci-local-parcial)
- [Verificar DB y garantía](#verificar-db-y-garantía)
- [Aplicar esquema y garantías](#aplicar-esquema-y-garantías)
- [GitHub Actions y artifacts](#github-actions-y-artifacts)
- [Diagnóstico](#diagnóstico)
- [Rollback Git futuro](#rollback-git-futuro)
- [Rollback de despliegue](#rollback-de-despliegue)

## Alcance operativo

Recetas futuras, no todas ejecutadas aquí. Ambos repos hermanos. Instalar/build/generar escriben archivos; DDL/seed/E2E modifican destino. Identificar ambiente/recursos propios, no imprimir secretos.

## Instalación y desarrollo

```bash
cd ~/Proyectos/inventario_back
npm ci --ignore-scripts --no-audit --no-fund
# Sólo nuevo checkout sin .env:
cp .env.example .env
# Completar configuración propia
npm run contract:emit
npm run start:dev
```

```bash
cd ~/Proyectos/inventario_front
npm ci --ignore-scripts --no-audit --no-fund
npm start
```

BD development dedicada: docker compose up -d postgres desde backend tras revisar puerto/volumen/configuración. No sustituye migración.

## Compilar, lint y unitarias

```bash
cd ~/Proyectos/inventario_back
npm exec -- tsc --noEmit --incremental false
npm run lint
npm test -- --configLoader runner --no-file-parallelism
npm run build
```

```bash
cd ~/Proyectos/inventario_front
npm run api:check
npm run typecheck
npm run typecheck:unused
npm run lint
npm test
npm run build
npm run test:e2e-components
node --test scripts/tests/ci-results.test.mjs
node scripts/ci-contracts.mjs
```

format no es check: escribe. api:generate/contract:emit generan. Backend build regenera dist; no usado durante auditoría.

## Integración y E2E aislados

Desde frontend, lifecycle de CI con recursos propios/destrucción; nunca URL productiva:

```bash
cd ~/Proyectos/inventario_front
npx playwright install chromium
export E2E_DB_KIND=test
export E2E_ALLOW_MUTATIONS=1
export E2E_CYCLE=auditoria-local
export E2E_LIFECYCLE_EVIDENCE_DIR=.ci-evidence/fase-1
node scripts/e2e-lifecycle.mjs up
node scripts/e2e-lifecycle.mjs verify
node scripts/e2e-run.mjs --integration
node scripts/ci-contracts.mjs
node scripts/ci-results.mjs vitest .ci-evidence/fase-1/auditoria-local/backend-integration.json 312
node scripts/ci-results.mjs playwright .ci-evidence/fase-1/auditoria-local/results.json 26 --allow-reader
node scripts/e2e-lifecycle.mjs evidence
node scripts/ci-cleanup.mjs e2e
```

Si falla un paso ejecutar cleanup propio en finally/trap autorizado conservando evidence, no docker rm/down genérico. Integración directa backend: TEST_INVENTARIO_DB=1 npm run test:e2e -- --no-file-parallelism, sólo variables test/BD aislada verificada. No basta bandera test con .env usual.

## Docker y CI local parcial

```bash
cd ~/Proyectos/inventario_front
# .env.production.local propio ya configurado
npm run docker:config
npm run docker:build
# Sólo primera BD Compose local vacía:
npm run docker:bootstrap
npm run docker:up
npm run docker:ps
```

```bash
cd ~/Proyectos
docker build --target runtime -t inventario-front:phase2a inventario_front
docker build --target runtime -t inventario-back:phase2a inventario_back
docker build --target tools -t inventario-back-tools:phase2a inventario_back
cd inventario_front
npx playwright install chromium
node scripts/phase2a-local.mjs validation --representative --skip-integration
node scripts/ci-cleanup.mjs validation
```

Validation crea stack propio. No hay comando backend único equivalente a CI completo; ejecutar gates/2 ciclos/validators no reproduce permisos/runner/artifacts remotos. validate:full frontend existe pero no es todo el grafo.

## Verificar DB y garantía

```bash
cd ~/Proyectos/inventario_back
# Conexión autorizada, sin mostrar valor
npx prisma db verify
npx prisma db update --dry-run
```

Dry-run no aplica DDL; no se ejecutó contra producción. Verificadores docs requieren revisar SQL/alcance antes de usarlos productivamente.

psql conectado a BD autorizada sin URL en argumento:

```sql
SELECT conname, pg_get_constraintdef(oid)
FROM pg_constraint
WHERE conrelid = 'public."productoPrecio"'::regclass
  AND conname = 'producto_precio_sin_solapamiento';
```

Comprobar definición completa EXCLUDE/WHERE, no sólo nombre. Solapamiento/integridad en verificador 5B y entorno controlado; no inducir escritura productiva.

## Aplicar esquema y garantías

**Modifica BD**, sólo tarea autorizada/destino propio. Producción necesita plan formal/replay/backup, no esta receta development:

```bash
cd ~/Proyectos/inventario_back
npm run contract:emit
npx prisma db update --dry-run
# Revisar plan/destino antes de aplicación
npx prisma db update
npm run build
node docs/backend-5b/aplicar-garantias.mjs
npx prisma db verify
```

SQL puro no idempotente; mjs comprueba nombre y requiere build. Bootstrap local vacío está en docker:bootstrap; no aplicarlo a DB existente para reparar.

## GitHub Actions y artifacts

```bash
gh run list --repo Dennis9901/inventario_back --limit 20
gh run view 37679392828 --repo Dennis9901/inventario_back
gh run view 37679392828 --repo Dennis9901/inventario_back --json headSha,status,conclusion,jobs,url
gh run view 37679392828 --repo Dennis9901/inventario_back --log-failed
gh api repos/Dennis9901/inventario_back/actions/runs/37679392828/artifacts
gh run download 37679392828 --repo Dennis9901/inventario_back --dir /tmp/inventario-evidencia-release
```

Diagnóstico expira 7 días, certificación 30; revisar secrets/PII antes de compartir. Para frontend usar su repo/run.

## Diagnóstico

| Síntoma | Lectura/acción |
| --- | --- |
| 401 | Token/expiración/requestId, login nuevo; analizar revocación |
| 403 | Rol payload/decorador, solicitar permiso sin saltar guard |
| 409 stock | Existencia/movimientos/estado; reconciliar sin saldo manual |
| 409 precio | Vigencias UTC/EXCLUDE/cierre explícito |
| 409 preview | Hash/plan obsoleto; cancelar y crear nuevo |
| 503 ready | DB/red/SELECT 1/logs saneados |
| ENOENT CI | tracked/checkout/contexto/directorio destino |
| Unhealthy | Compose ps/logs/dependencias schema, no bootstrap a ciegas |
| audit_failure | Negocio ya confirmado, reconciliar sin duplicarlo |

```bash
cd ~/Proyectos/inventario_front
docker compose -f docker-compose.prod.yml --env-file .env.production.local ps
docker compose -f docker-compose.prod.yml --env-file .env.production.local logs --tail 100 backend schema frontend
curl --fail http://127.0.0.1:48080/api/v1/health
curl --fail http://127.0.0.1:48080/api/v1/health/ready
curl --fail http://127.0.0.1:48080/healthz
```

## Rollback Git futuro

Lectura git log/show/status primero. En tarea autorizada/checkout preparado, revert produce cambio revisable sin destruir historial:

```bash
# Ejemplo, no ejecutado aquí
git revert --no-commit <commit-a-revertir>
git diff --check
git diff
# Tests/revisión/PR antes de commit/publicación autorizados
```

Merge necesita revisar parent y estrategia aparte. Revert escribe código, fuera de auditoría. No equivale rollback despliegue/DB.

## Rollback de despliegue

No existe comando productivo implementado. Propuesta: digest anterior conservado, esquema compatible, manifest aprobado, desplegar/health/smoke/logs. Backup restore ensayado y pérdida de escrituras decidida. No borrar postgres_data ni downgrade automático del contrato.
