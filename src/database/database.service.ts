import { requestContext } from '../common/http/request-context.js';
import { datosAuditoria } from '../common/http/audit-data.js';
import { Injectable } from '@nestjs/common';
import { db } from '../prisma/db.js';

export type DatabaseTransaction = Parameters<
  Parameters<typeof db.transaction>[0]
>[0];

@Injectable()
export class DatabaseService {
  readonly db = db;

  // El callback comercial y su evidencia administrativa comparten el mismo commit/rollback.
  async transaction<T>(
    callback: (tx: DatabaseTransaction) => Promise<T>,
  ): Promise<T> {
    const contexto = requestContext.getStore();
    return this.db.transaction(async (tx) => {
      const resultado = await callback(tx);
      if (contexto?.auditoria && !contexto.auditoriaPersistida) {
        await tx.orm.public.Auditoria.create(
          datosAuditoria(contexto, resultado),
        );
        contexto.auditoriaPersistida = true;
      }
      return resultado;
    });
  }

  // El bloqueo pertenece a la transacción; protege incluso productos sin Existencia.
  async bloquearProducto(tx: DatabaseTransaction, productoId: number) {
    const plan = this.db.raw.sql`
      SELECT id FROM public.producto WHERE id = ${productoId} FOR UPDATE
    `
      .returnsRow({ id: 'pg/int4@1' })
      .build();
    await tx.query(plan);
  }
}
