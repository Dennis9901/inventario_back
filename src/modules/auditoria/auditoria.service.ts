import { Injectable, NotFoundException } from '@nestjs/common';
import { or } from '@prisma/orm-postgres/orm-client';
import { DatabaseService } from '../../database/database.service.js';
import { paginacion } from '../inventario/paginacion.js';
import {
  patronBusqueda,
  rangoFechas,
  validarId,
} from '../../common/consulta.js';
import { AuditoriaQueryDto } from './dto/auditoria-query.dto.js';

@Injectable()
export class AuditoriaService {
  constructor(private readonly database: DatabaseService) {}
  private consulta() {
    return this.database.db.orm.public.Auditoria.include('usuario', (u) =>
      u.select('id', 'nombre', 'email'),
    );
  }
  async findAll(query: AuditoriaQueryDto) {
    const { desde, hasta } = rangoFechas(query.fechaInicio, query.fechaFin);
    let consulta = this.consulta();
    if (query.usuarioId !== undefined)
      consulta = consulta.where({ usuarioId: query.usuarioId });
    if (query.entidadId !== undefined)
      consulta = consulta.where({ entidadId: query.entidadId });
    if (query.accion !== undefined)
      consulta = consulta.where({ accion: query.accion });
    if (query.entidad !== undefined)
      consulta = consulta.where({ entidad: query.entidad });
    if (desde) consulta = consulta.where((a) => a.createdAt.gte(desde));
    if (hasta) consulta = consulta.where((a) => a.createdAt.lte(hasta));
    if (query.search) {
      const p = patronBusqueda(query.search);
      consulta = consulta.where((a) =>
        or(
          a.requestId.ilike(p),
          a.accion.ilike(p),
          a.entidad.ilike(p),
          a.descripcion.ilike(p),
        ),
      );
    }
    const [data, total] = await Promise.all([
      consulta
        .orderBy([
          (a) =>
            query.sortOrder === 'asc' ? a.createdAt.asc() : a.createdAt.desc(),
          (a) => (query.sortOrder === 'asc' ? a.id.asc() : a.id.desc()),
        ])
        .limit(query.limit)
        .offset((query.page - 1) * query.limit)
        .all(),
      consulta.aggregate((a) => ({ totalItems: a.count() })),
    ]);
    return { data, pagination: paginacion(query, total.totalItems) };
  }
  async findOne(id: number) {
    validarId(id);
    const fila = await this.consulta().where({ id }).first();
    if (!fila)
      throw new NotFoundException('El registro de auditoría no existe');
    return fila;
  }
}
