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
import { CreateClienteDto } from './dto/create-cliente.dto.js';
import { UpdateClienteDto } from './dto/update-cliente.dto.js';
import { ClienteQueryDto } from './dto/cliente-query.dto.js';

@Injectable()
export class ClientesService {
  constructor(private readonly database: DatabaseService) {}

  async findAll(query = new ClienteQueryDto()) {
    let consulta = this.database.db.orm.public.Cliente;
    if (query.search) {
      const patron = patronBusqueda(query.search);
      consulta = consulta.where((p) =>
        or(
          p.nombre.ilike(patron),
          p.apellido.ilike(patron),
          p.telefono.ilike(patron),
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
    const cliente = await this.database.db.orm.public.Cliente.where({
      id,
    }).first();
    if (!cliente) throw new NotFoundException('El cliente no existe');
    return cliente;
  }

  async bloquear(tx: DatabaseTransaction, id: number) {
    validarId(id);
    await tx.query(
      this.database.db.raw
        .sql`SELECT id FROM public.cliente WHERE id = ${id} FOR UPDATE`
        .returnsRow({ id: 'pg/int4@1' })
        .build(),
    );
    const cliente = await tx.orm.public.Cliente.where({ id }).first();
    if (!cliente) throw new NotFoundException('El cliente no existe');
    return cliente;
  }

  private normalizar(dto: UpdateClienteDto | CreateClienteDto) {
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
      ...(dto.apellido !== undefined && {
        apellido: dto.apellido.trim() || null,
      }),
    };
  }

  async create(dto: CreateClienteDto) {
    try {
      return await this.database.db.orm.public.Cliente.create({
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

  async update(id: number, dto: UpdateClienteDto) {
    try {
      return await this.database.db.transaction(async (tx) => {
        const cliente = await this.bloquear(tx, id);
        const cambios = this.normalizar(dto);
        if (!Object.keys(cambios).length) return cliente;
        await tx.orm.public.Cliente.where({ id }).update(cambios);
        return tx.orm.public.Cliente.where({ id }).first();
      });
    } catch (error: unknown) {
      if (tieneSqlState(error, '23505'))
        throw new ConflictException('El RFC ya se encuentra registrado');
      throw error;
    }
  }

  cambiarActivo(id: number, activo: boolean) {
    return this.database.db.transaction(async (tx) => {
      const cliente = await this.bloquear(tx, id);
      if (cliente.activo === activo)
        throw new ConflictException('El cliente ya tiene ese estado');
      await tx.orm.public.Cliente.where({ id }).update({ activo });
      return tx.orm.public.Cliente.where({ id }).first();
    });
  }

  remove(id: number) {
    return this.database.db.transaction(async (tx) => {
      const cliente = await this.bloquear(tx, id);
      if (await tx.orm.public.Venta.where({ clienteId: id }).first())
        throw new ConflictException(
          'El cliente tiene ventas; utiliza la baja lógica',
        );
      await tx.orm.public.Cliente.where({ id }).delete();
      return {
        message: 'Cliente eliminado definitivamente',
        cliente: { id, nombre: cliente.nombre },
      };
    });
  }
}
