import { db } from '../../dist/prisma/db.js';
try {
  // Idempotente; una instalación nueva aplica este complemento después de db update.
  const rows = await db.runtime().query(db.raw.sql`SELECT count(*)::int AS n FROM pg_constraint WHERE conrelid = 'public."productoPrecio"'::regclass AND conname = 'producto_precio_sin_solapamiento'`.returnsRow({ n:'pg/int4@1' }).build());
  if (!rows[0].n) await db.runtime().execute(db.raw.sql`
    ALTER TABLE public."productoPrecio" ADD CONSTRAINT producto_precio_sin_solapamiento
    EXCLUDE USING gist (
      int8range("productoId"::bigint, "productoId"::bigint, '[]') WITH &&,
      int8range("listaPrecioId"::bigint, "listaPrecioId"::bigint, '[]') WITH &&,
      tstzrange("vigenciaDesde", "vigenciaHasta", '[)') WITH &&
    ) WHERE (activo)
  `.affectedCount().build());
  console.log(JSON.stringify({ exclusion: 'producto_precio_sin_solapamiento', ok:true }));
} finally { await db.close(); }
