import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  DatabaseService,
  type DatabaseTransaction,
} from '../../database/database.service.js';
import { validarId } from '../../common/consulta.js';
import { tieneSqlState } from '../../common/errores-db.js';
import {
  CreateUnidadMedidaDto,
  UpdateUnidadMedidaDto,
} from './dto/unidad-medida.dto.js';
@Injectable()
export class UnidadesMedidaService {
  constructor(private readonly database: DatabaseService) {}
  findAll() {
    return this.database.db.orm.public.UnidadMedida.orderBy((u) =>
      u.id.asc(),
    ).all();
  }
  async findOne(id: number) {
    validarId(id);
    const unidad = await this.database.db.orm.public.UnidadMedida.where({
      id,
    }).first();
    if (!unidad) throw new NotFoundException('La unidad de medida no existe');
    return unidad;
  }
  async bloquear(tx: DatabaseTransaction, id: number) {
    validarId(id);
    await tx.query(
      this.database.db.raw
        .sql`SELECT id FROM public."unidadMedida" WHERE id = ${id} FOR UPDATE`
        .returnsRow({ id: 'pg/int4@1' })
        .build(),
    );
    const unidad = await tx.orm.public.UnidadMedida.where({ id }).first();
    if (!unidad) throw new NotFoundException('La unidad de medida no existe');
    return unidad;
  }
  private async proteger<T>(callback: () => Promise<T>): Promise<T> {
    try {
      return await callback();
    } catch (error: unknown) {
      if (tieneSqlState(error, '23505'))
        throw new ConflictException('La clave de unidad ya existe');
      if (tieneSqlState(error, '23503'))
        throw new ConflictException(
          'La unidad está relacionada con productos; utiliza la baja lógica',
        );
      throw error;
    }
  }
  create(dto: CreateUnidadMedidaDto) {
    return this.proteger(() =>
      this.database.transaction((tx) =>
        tx.orm.public.UnidadMedida.create({
          clave: dto.clave.trim().toUpperCase(),
          nombre: dto.nombre.trim(),
          activo: true,
        }),
      ),
    );
  }
  update(id: number, dto: UpdateUnidadMedidaDto) {
    return this.proteger(() =>
      this.database.transaction(async (tx) => {
        const unidad = await this.bloquear(tx, id);
        const cambios = {
          ...(dto.clave !== undefined && {
            clave: dto.clave.trim().toUpperCase(),
          }),
          ...(dto.nombre !== undefined && { nombre: dto.nombre.trim() }),
        };
        if (Object.keys(cambios).length)
          await tx.orm.public.UnidadMedida.where({ id }).update(cambios);
        return Object.keys(cambios).length
          ? tx.orm.public.UnidadMedida.where({ id }).first()
          : unidad;
      }),
    );
  }
  cambiarActivo(id: number, activo: boolean) {
    return this.database.transaction(async (tx) => {
      const unidad = await this.bloquear(tx, id);
      if (unidad.activo === activo)
        throw new ConflictException('La unidad ya tiene ese estado');
      await tx.orm.public.UnidadMedida.where({ id }).update({ activo });
      return tx.orm.public.UnidadMedida.where({ id }).first();
    });
  }
  remove(id: number) {
    return this.proteger(() =>
      this.database.transaction(async (tx) => {
        const unidad = await this.bloquear(tx, id);
        if (await tx.orm.public.Producto.where({ unidadMedidaId: id }).first())
          throw new ConflictException(
            'La unidad está relacionada con productos; utiliza la baja lógica',
          );
        await tx.orm.public.UnidadMedida.where({ id }).delete();
        return { message: 'Unidad eliminada definitivamente', id: unidad.id };
      }),
    );
  }
}
