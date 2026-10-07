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
    let consulta =
      this.database.db.orm.public.Cliente.include('domicilioFiscal');
    if (query.search) {
      const patron = patronBusqueda(query.search);
      consulta = consulta.where((p) =>
        or(
          p.nombre.ilike(patron),
          p.nombreComercial.ilike(patron),
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
    })
      .include('domicilioFiscal')
      .first();
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

  normalizar(dto: UpdateClienteDto | CreateClienteDto) {
    return {
      ...(dto.nombreComercial !== undefined && {
        nombreComercial: dto.nombreComercial.trim() || null,
      }),
      ...(dto.regimenFiscal !== undefined && {
        regimenFiscal: dto.regimenFiscal.trim() || null,
      }),
      ...(dto.usoCfdi !== undefined && { usoCfdi: dto.usoCfdi.trim() || null }),
      ...(dto.numeroRegistroTributario !== undefined && {
        numeroRegistroTributario: dto.numeroRegistroTributario.trim() || null,
      }),
      ...(dto.residenciaFiscal !== undefined && {
        residenciaFiscal: dto.residenciaFiscal.trim() || null,
      }),
      ...(dto.celular !== undefined && { celular: dto.celular.trim() || null }),
      ...(dto.emailAlterno !== undefined && {
        emailAlterno: dto.emailAlterno.trim().toLowerCase() || null,
      }),
      ...(dto.nombre !== undefined && { nombre: dto.nombre.trim() }),
      ...(dto.razonSocial !== undefined && {
        razonSocial: dto.razonSocial.trim() || null,
      }),
      ...(dto.rfc !== undefined && {
        rfc: dto.rfc.trim().toUpperCase() || null,
      }),
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

  private async guardarDomicilio(
    tx: DatabaseTransaction,
    clienteId: number,
    dto: UpdateClienteDto | CreateClienteDto,
    existenteConocido?: boolean,
  ) {
    if (dto.domicilioFiscal === undefined) return;
    const d = dto.domicilioFiscal;
    const cambios = {
      ...(d.pais !== undefined && { pais: d.pais.trim() || null }),
      ...(d.estado !== undefined && { estado: d.estado.trim() || null }),
      ...(d.municipio !== undefined && {
        municipio: d.municipio.trim() || null,
      }),
      ...(d.localidad !== undefined && {
        localidad: d.localidad.trim() || null,
      }),
      ...(d.colonia !== undefined && { colonia: d.colonia.trim() || null }),
      ...(d.calle !== undefined && { calle: d.calle.trim() || null }),
      ...(d.referencia !== undefined && {
        referencia: d.referencia.trim() || null,
      }),
      ...(d.codigoPostal !== undefined && {
        codigoPostal: d.codigoPostal.trim() || null,
      }),
      ...(d.numeroExterior !== undefined && {
        numeroExterior: d.numeroExterior.trim() || null,
      }),
      ...(d.numeroInterior !== undefined && {
        numeroInterior: d.numeroInterior.trim() || null,
      }),
    };
    const existente =
      existenteConocido !== undefined
        ? existenteConocido
        : await tx.orm.public.DomicilioCliente.where({ clienteId }).first();
    if (existente) {
      if (Object.keys(cambios).length)
        await tx.orm.public.DomicilioCliente.where({ clienteId }).update(
          cambios,
        );
    } else
      await tx.orm.public.DomicilioCliente.create({ clienteId, ...cambios });
  }

  // El importador ya revalidó y bloqueó las identidades del batch; comparte
  // normalización y domicilio con los endpoints sin abrir transacciones anidadas.
  async guardarImportadoEnTransaccion(
    tx: DatabaseTransaction,
    dto: CreateClienteDto,
    id?: number,
    tieneDomicilio = false,
  ) {
    const datos = this.normalizar(dto);
    const cliente =
      id !== undefined
        ? await tx.orm.public.Cliente.where({ id }).update(datos)
        : await tx.orm.public.Cliente.create({
            ...datos,
            nombre: dto.nombre.trim(),
            activo: true,
          });
    if (!cliente) throw new NotFoundException('El cliente no existe');
    await this.guardarDomicilio(tx, cliente.id, dto, tieneDomicilio);
    return cliente;
  }

  async create(dto: CreateClienteDto) {
    try {
      return await this.database.transaction(async (tx) => {
        const cliente = await tx.orm.public.Cliente.create({
          ...this.normalizar(dto),
          nombre: dto.nombre.trim(),
          activo: true,
        });
        await this.guardarDomicilio(tx, cliente.id, dto);
        return tx.orm.public.Cliente.where({ id: cliente.id })
          .include('domicilioFiscal')
          .first();
      });
    } catch (error: unknown) {
      if (tieneSqlState(error, '23505'))
        throw new ConflictException('El RFC ya se encuentra registrado');
      throw error;
    }
  }

  async update(id: number, dto: UpdateClienteDto) {
    try {
      return await this.database.transaction(async (tx) => {
        const cliente = await this.bloquear(tx, id);
        const cambios = this.normalizar(dto);
        if (!Object.keys(cambios).length && dto.domicilioFiscal === undefined)
          return tx.orm.public.Cliente.where({ id: cliente.id })
            .include('domicilioFiscal')
            .first();
        if (Object.keys(cambios).length)
          await tx.orm.public.Cliente.where({ id }).update(cambios);
        await this.guardarDomicilio(tx, id, dto);
        return tx.orm.public.Cliente.where({ id })
          .include('domicilioFiscal')
          .first();
      });
    } catch (error: unknown) {
      if (tieneSqlState(error, '23505'))
        throw new ConflictException('El RFC ya se encuentra registrado');
      throw error;
    }
  }

  cambiarActivo(id: number, activo: boolean) {
    return this.database.transaction(async (tx) => {
      const cliente = await this.bloquear(tx, id);
      if (cliente.activo === activo)
        throw new ConflictException('El cliente ya tiene ese estado');
      await tx.orm.public.Cliente.where({ id }).update({ activo });
      return tx.orm.public.Cliente.where({ id })
        .include('domicilioFiscal')
        .first();
    });
  }

  remove(id: number) {
    return this.database.transaction(async (tx) => {
      const cliente = await this.bloquear(tx, id);
      if (await tx.orm.public.Venta.where({ clienteId: id }).first())
        throw new ConflictException(
          'El cliente tiene ventas; utiliza la baja lógica',
        );
      await tx.orm.public.DomicilioCliente.where({ clienteId: id }).deleteAll();
      await tx.orm.public.Cliente.where({ id }).delete();
      return {
        message: 'Cliente eliminado definitivamente',
        cliente: { id, nombre: cliente.nombre },
      };
    });
  }
}
