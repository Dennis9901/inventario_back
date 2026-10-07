-- Complemento aditivo al contract: Prisma RC no expresa EXCLUDE.
-- Rangos nativos GiST: no requiere btree_gist ni instalar extensiones.
ALTER TABLE public."productoPrecio"
  ADD CONSTRAINT producto_precio_sin_solapamiento
  EXCLUDE USING gist (
    int8range("productoId"::bigint, "productoId"::bigint, '[]') WITH &&,
    int8range("listaPrecioId"::bigint, "listaPrecioId"::bigint, '[]') WITH &&,
    tstzrange("vigenciaDesde", "vigenciaHasta", '[)') WITH &&
  ) WHERE (activo);
