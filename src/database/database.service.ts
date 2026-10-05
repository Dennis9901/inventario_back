import { Injectable } from '@nestjs/common';
import { db } from '../prisma/db.js';

export type DatabaseTransaction = Parameters<
  Parameters<typeof db.transaction>[0]
>[0];

@Injectable()
export class DatabaseService {
  readonly db = db;

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
