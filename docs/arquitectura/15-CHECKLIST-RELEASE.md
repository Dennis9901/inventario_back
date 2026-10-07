# Checklist de release

Auditoría 2026-10-07 · Backend `4189fa483ecbbed242946cefc6d4282e0e13dfe8` · Frontend `be0f12e0bf48d6df05afb1eced092b34c915e1cf`.

[Índice](00-README.md) · [Documento maestro](../ARQUITECTURA-INVENTARIO.md)

## Contenido

- [Baseline comprobado](#baseline-comprobado)
- [Release nueva](#release-nueva)
- [Bloqueadores de producción pendientes](#bloqueadores-de-producción-pendientes)
- [Registro de cierre](#registro-de-cierre)
- [Calidad documental](#calidad-documental)

## Baseline comprobado

Estos checks sólo describen Sprint 7, no autorizan entrega futura:

- [x] Backend SHA 4189fa483ecbbed242946cefc6d4282e0e13dfe8.
- [x] Frontend SHA be0f12e0bf48d6df05afb1eced092b34c915e1cf.
- [x] Run 37679392828 completed/success, todos gates.
- [x] Backend unit 567/567, frontend 450/450.
- [x] Integración 312/312 y browser 26 passed/1 skipped opcional por ciclo.
- [x] Business/destrucción/upload success ambos ciclos.
- [x] CI certification success.
- [x] Tsc/lint y 567 unit backend nuevos de auditoría; 7 warnings sin corregir.

## Release nueva

- [ ] Pareja SHA/cambios identificados y contratos/tipos coherentes.
- [ ] Endpoints/roles/rutas revisados, sin autorización sólo UI.
- [ ] CI/evidence nueva corresponde a esos SHA; no retries/flaky/skips indebidos.
- [ ] Untracked revisados por origen/sensibilidad/necesidad, sin clean automático.
- [ ] Migración/índices/EXCLUDE revisados/replay probados.
- [ ] Compatibilidad/rollback app y DB documentados.
- [ ] Secrets/dependencias/actions y warnings revisados.
- [ ] Archive duradero evidence cuando requiera auditoría.

## Bloqueadores de producción pendientes

- [ ] Host/red/TLS/dominio definidos.
- [ ] Registry/promoción digests implementados.
- [ ] Origen/grafo migraciones formal y replay.
- [ ] EXCLUDE definición/integridad comprobadas.
- [ ] Roles SQL mínimos/secrets propios/alta admin real segura.
- [ ] JWT revocación/TTL y protección login aprobados.
- [ ] Backup/restore ensayado con RPO/RTO.
- [ ] Logs/alertas/retención/privacidad operativos.
- [ ] Rollback imágenes/recuperación DB ensayados.
- [ ] Smoke staging y aprobación productiva responsable.

## Registro de cierre

Fecha/responsable, pareja SHA/run/digests, storageHash/GiST/migración, backup recuperable, health/smoke y decisión rollback; sin valores secrets ni registros reales. Checklist verde CI no sustituye estos pendientes operativos.

## Calidad documental

- [x] Archivos/enlaces existentes.
- [x] Scripts contra package.json.
- [x] Endpoint contra código/OpenAPI.
- [x] DB contra contrato emitido.
- [x] CI contra needs YAML real.
- [x] Commits/runs con evidencia.
- [x] Diff/check whitespace y secrets.
- [x] Estado/historia/propuestas sin contradicción.
