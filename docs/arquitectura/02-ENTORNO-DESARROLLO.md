# Entorno de desarrollo

Auditoría 2026-10-07 · Backend `4189fa483ecbbed242946cefc6d4282e0e13dfe8` · Frontend `be0f12e0bf48d6df05afb1eced092b34c915e1cf`.

[Índice](00-README.md) · [Documento maestro](../ARQUITECTURA-INVENTARIO.md)

## Contenido

- [Requisitos y organización](#requisitos-y-organización)
- [Instalación y desarrollo](#instalación-y-desarrollo)
- [Variables backend](#variables-backend)
- [Scripts npm completos](#scripts-npm-completos)
- [Compilación](#compilación)
- [Fuentes](#fuentes)

## Requisitos y organización

Repositorios hermanos ~/Proyectos/inventario_back y ~/Proyectos/inventario_front. Contratos, E2E y Compose usan rutas relativas hacia el compañero. Referencia CI Node 24.21.0/npm/lockfiles; Docker/Compose, Chromium y acceso npm para validación completa. Reportes históricos Node 22 no sustituyen el runtime CI actual.

## Instalación y desarrollo

```bash
cd ~/Proyectos/inventario_back
npm ci --ignore-scripts --no-audit --no-fund
# Sólo checkout nuevo sin .env existente:
cp .env.example .env
# Completar valores propios localmente, sin imprimir secretos
npm run contract:emit
npm run start:dev
# Otra terminal
cd ~/Proyectos/inventario_front
npm ci --ignore-scripts --no-audit --no-fund
npm start
```

No sobrescribir .env existente. Ignore-scripts evita postinstall prisma skills sync; CI emite contrato explícitamente. BD development debe existir y tener esquema; Compose backend sólo levanta PostgreSQL local con credenciales de ejemplo versionadas y puerto 5432. No es configuración productiva ni seed de administrador.

## Variables backend

| Variable | Requisito/default |
| --- | --- |
| DATABASE_URL | URL PostgreSQL válida, requerida |
| JWT_SECRET | Requerido; mínimo 32 caracteres en producción |
| JWT_EXPIRES_IN | 8h; unidades s/m/h/d, rango validado |
| PORT | 3000; entero 1–65535 |
| NODE_ENV | development/test/production |
| CORS_ORIGINS | HTTP exactos separados por comas; explícito en producción |
| IMPORT_MAX_BYTES | 2 MiB default, 10 MiB máximo |
| IMPORT_MAX_FILAS | 2000 default, 5000 máximo |
| IMPORT_MAX_EXPANDIDO_BYTES | 20 MiB default, 50 MiB máximo |
| IMPORT_PREVIEW_HORAS | 24 default, 168 máximo |

Otras cotas: 200 entradas ZIP, 100 columnas, 10000 caracteres/celda. En Angular development apiBaseUrl localhost:3000/api/v1; producción /api/v1. Environments son código público y no deben contener secretos.

## Scripts npm completos


| Repo | Script | Comando declarado |
| --- | --- | --- |
| Backend | build | `nest build` |
| Backend | deploy | `nest deploy` |
| Backend | format | `prettier --write "src/**/*.ts" "test/**/*.ts"` |
| Backend | start | `nest start` |
| Backend | start:dev | `nest start --watch` |
| Backend | start:debug | `nest start --debug --watch` |
| Backend | start:prod | `node dist/main` |
| Backend | lint | `oxlint --type-aware src/ test/` |
| Backend | test | `vitest run` |
| Backend | test:watch | `vitest` |
| Backend | test:cov | `vitest run --coverage` |
| Backend | test:debug | `vitest --inspect-brk --no-file-parallelism` |
| Backend | test:e2e | `vitest run --config ./vitest.config.e2e.ts` |
| Backend | postinstall | `prisma skills sync \|\| exit 0` |
| Backend | contract:emit | `prisma contract emit` |
| Frontend | start | `ng serve` |
| Frontend | docker:config | `docker compose -f docker-compose.prod.yml --env-file .env.production.local config --quiet` |
| Frontend | docker:build | `docker compose -f docker-compose.prod.yml --env-file .env.production.local build` |
| Frontend | docker:bootstrap | `docker compose -f docker-compose.prod.yml --env-file .env.production.local run --rm schema bootstrap` |
| Frontend | docker:up | `docker compose -f docker-compose.prod.yml --env-file .env.production.local up -d --wait` |
| Frontend | docker:ps | `docker compose -f docker-compose.prod.yml --env-file .env.production.local ps` |
| Frontend | build | `ng build` |
| Frontend | test | `vitest run` |
| Frontend | test:e2e-components | `node scripts/tests/phase1-e2e.test.mjs` |
| Frontend | e2e:up | `node scripts/e2e-lifecycle.mjs up` |
| Frontend | e2e:verify | `node scripts/e2e-lifecycle.mjs verify` |
| Frontend | e2e:down | `node scripts/e2e-lifecycle.mjs down` |
| Frontend | e2e:reset | `node scripts/e2e-lifecycle.mjs reset` |
| Frontend | e2e:test | `node scripts/e2e-run.mjs` |
| Frontend | e2e:quality | `node scripts/e2e-run.mjs --quality` |
| Frontend | typecheck | `tsc -p tsconfig.app.json --noEmit && tsc -p tsconfig.spec.json --noEmit` |
| Frontend | api:generate | `node scripts/generate-api.mjs` |
| Frontend | api:check | `node scripts/generate-api.mjs --check` |
| Frontend | test:watch | `vitest` |
| Frontend | validate | `npm run api:check && npm run typecheck && npm run typecheck:unused && npm test && npm run build` |
| Frontend | tooling:install | `node scripts/sprint6-tooling.mjs install` |
| Frontend | lint | `node scripts/sprint6-tooling.mjs lint` |
| Frontend | e2e | `node scripts/sprint6-tooling.mjs e2e` |
| Frontend | e2e:list | `node scripts/sprint6-tooling.mjs e2e --list` |
| Frontend | typecheck:unused | `tsc -p tsconfig.app.json --noEmit --noUnusedLocals --noUnusedParameters` |
| Frontend | validate:full | `npm run validate && npm run lint && npm run e2e` |

format escribe código, api:generate escribe tipos y contract:emit genera artefactos. deploy declara nest deploy pero no demuestra destino productivo real. e2e:reset/down afectan entorno propio test sólo con guards satisfechos.

## Compilación

Backend ESM, target ES2023, decorators/metadata y strict TypeScript; strictPropertyInitialization false. tsconfig.build limita src y excluye specs. nest-cli deleteOutDir true: build regenera dist. Angular builder application, build production default, AOT/strictTemplates, assets public, salida dist/inventario_front/browser. Budgets inicial 600kB warning/1MB error; estilos 8kB/16kB.

## Fuentes

- [backend/package.json](../../package.json)
- [backend/package-lock.json](../../package-lock.json)
- [backend/.env.example](../../.env.example)
- [backend/tsconfig.json](../../tsconfig.json)
- [backend/tsconfig.build.json](../../tsconfig.build.json)
- [backend/nest-cli.json](../../nest-cli.json)
- [backend/src/configuracion/configuracion.ts](../../src/configuracion/configuracion.ts)
- [backend/src/modules/importaciones/importaciones.config.ts](../../src/modules/importaciones/importaciones.config.ts)

[frontend/package.json](../../../inventario_front/package.json)

[frontend/angular.json](../../../inventario_front/angular.json)
