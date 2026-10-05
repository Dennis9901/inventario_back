import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { or } from '@prisma/orm-postgres/orm-client';
import { DatabaseService } from '../../database/database.service.js';
import type { DatabaseTransaction } from '../../database/database.service.js';
import { paginacion } from '../inventario/paginacion.js';
import { patronBusqueda, validarId } from '../../common/consulta.js';
import { tieneSqlState } from '../../common/errores-db.js';
import { CreateProveedorDto } from './dto/create-proveedor.dto.js';
import { UpdateProveedorDto } from './dto/update-proveedor.dto.js';
import { ProveedorQueryDto } from './dto/proveedor-query.dto.js';

@Injectable()
export class ProveedoresService {
  constructor(private readonly database: DatabaseService) {}

  async findAll(query = new ProveedorQueryDto()) {
    let consulta = this.database.db.orm.public.Proveedor;
    if (query.search) {
      const patron = patronBusqueda(query.search);
      consulta = consulta.where((p) =>
        or(
          p.nombre.ilike(patron),
          p.razonSocial.ilike(patron),
          p.rfc.ilike(patron),
          p.email.ilike(patron),
        ),
      );
    }
    const [data, total] = await Promise.all([
      consulta
        .orderBy((p) => p.id.desc())
        .limit(query.limit)
        .offset((query.page - 1) * query.limit)
        .all(),
      consulta.aggregate((a) => ({ totalItems: a.count() })),
    ]);
    return { data, pagination: paginacion(query, total.totalItems) };
  }

  async findOne(id: number) {
    validarId(id);
    const proveedor = await this.database.db.orm.public.Proveedor.where({
      id,
    }).first();
    if (!proveedor) throw new NotFoundException('El proveedor no existe');
    return proveedor;
  }

  async bloquear(tx: DatabaseTransaction, id: number) {
    validarId(id);
    await tx.query(
      this.database.db.raw
        .sql`SELECT id FROM public.proveedor WHERE id = ${id} FOR UPDATE`
        .returnsRow({ id: 'pg/int4@1' })
        .build(),
    );
    const proveedor = await tx.orm.public.Proveedor.where({ id }).first();
    if (!proveedor) throw new NotFoundException('El proveedor no existe');
    return proveedor;
  }

  private normalizar(dto: UpdateProveedorDto | CreateProveedorDto) {
    return {
      ...(dto.nombre !== undefined && { nombre: dto.nombre.trim() }),
      ...(dto.razonSocial !== undefined && {
        razonSocial: dto.razonSocial.trim() || null,
      }),
      ...(dto.rfc !== undefined && { rfc: dto.rfc.trim().toUpperCase() }),
      ...(dto.email !== undefined && { email: dto.email.trim().toLowerCase() }),
      ...(dto.telefono !== undefined && {
        telefono: dto.telefono.trim() || null,
      }),
      ...(dto.direccion !== undefined && {
        direccion: dto.direccion.trim() || null,
      }),
      ...(dto.contacto !== undefined && {
        contacto: dto.contacto.trim() || null,
      }),
    };
  }

  async create(dto: CreateProveedorDto) {
    try {
      return await this.database.db.orm.public.Proveedor.create({
        ...this.normalizar(dto),
        nombre: dto.nombre.trim(),
        activo: true,
      });
    } catch (error: unknown) {
      if (tieneSqlState(error, '23505'))
        throw new ConflictException('El RFC ya se encuentra registrado');
      throw error;
    }
  }

  async update(id: number, dto: UpdateProveedorDto) {
    try {
      return await this.database.db.transaction(async (tx) => {
        await this.bloquear(tx, id);
        await tx.orm.public.Proveedor.where({ id }).update(
          this.normalizar(dto),
        );
        return tx.orm.public.Proveedor.where({ id }).first();
      });
    } catch (error: unknown) {
      if (tieneSqlState(error, '23505'))
        throw new ConflictException('El RFC ya se encuentra registrado');
      throw error;
    }
  }

  cambiarActivo(id: number, activo: boolean) {
    return this.database.db.transaction(async (tx) => {
      const proveedor = await this.bloquear(tx, id);
      if (proveedor.activo === activo)
        throw new ConflictException('El proveedor ya tiene ese estado');
      await tx.orm.public.Proveedor.where({ id }).update({ activo });
      return tx.orm.public.Proveedor.where({ id }).first();
    });
  }

  remove(id: number) {
    return this.database.db.transaction(async (tx) => {
      const proveedor = await this.bloquear(tx, id);
      if (await tx.orm.public.Compra.where({ proveedorId: id }).first())
        throw new ConflictException(
          'El proveedor tiene compras; utiliza la baja lógica',
        );
      await tx.orm.public.Proveedor.where({ id }).delete();
      return {
        message: 'Proveedor eliminado definitivamente',
        proveedor: { id, nombre: proveedor.nombre },
      };
    });
  }
}
