import { Injectable,
          ConflictException,
NotFoundException} from '@nestjs/common';
import { DatabaseService } from '../../database/database.service.js';
import { CreateCategoriaDto } from './dto/create-categoria.dto.js';
import { UpdateCategoriaDto } from './dto/update-categoria.dto.js';


@Injectable()
export class CategoriasService {
  constructor(private readonly databaseService: DatabaseService) {}

  async findAll() {
    return this.databaseService.db.orm.public.Categoria.all();
  }

  async findOne(id: number) {
    const categoria = await this.databaseService.db.orm.public.Categoria.where({
      id,
    }).first();

    if (!categoria) {
      throw new NotFoundException('La categoría no existe');
    }

    return categoria;
  }

  async create(createCategoriaDto: CreateCategoriaDto) {
    const nombre = createCategoriaDto.nombre.trim().toUpperCase();

    const existente = await this.databaseService.db.orm.public.Categoria.where({
      nombre,
    }).first();

    if (existente) {
      throw new ConflictException(
        `La categoría ${nombre} ya se encuentra registrada`,
      );
    }

    return this.databaseService.db.orm.public.Categoria.create({
      nombre,
      descripcion: createCategoriaDto.descripcion?.trim() ?? null,
      activo: createCategoriaDto.activo ?? true,
    });
  }

  async desactivar(id: number) {
    const categoria = await this.findOne(id);

    if (!categoria.activo) {
      throw new ConflictException('La categoría ya se encuentra inactiva');
    }

    return this.databaseService.db.orm.public.Categoria.where({ id }).update({
      activo: false,
    });
  }

  async activar(id: number) {
    const categoria = await this.findOne(id);

    if (categoria.activo) {
      throw new ConflictException('La categoría ya se encuentra activa');
    }

    return this.databaseService.db.orm.public.Categoria.where({ id }).update({
      activo: true,
    });
  }

  async remove(id: number) {
    const categoria = await this.findOne(id);

    await this.databaseService.db.orm.public.Categoria.where({ id }).delete();

    return {
      message: 'Categoría eliminada definitivamente',
      categoria: {
        id: categoria.id,
        nombre: categoria.nombre,
      },
    };
  }

  async update(id: number, updateCategoriaDto: UpdateCategoriaDto) {
    const categoria = await this.findOne(id);

    let nombre: string | undefined;

    if (updateCategoriaDto.nombre !== undefined) {
      nombre = updateCategoriaDto.nombre.trim().toUpperCase();

      if (!nombre) {
        throw new ConflictException(
          'El nombre de la categoría no puede estar vacío',
        );
      }

      const existente =
        await this.databaseService.db.orm.public.Categoria.where({
          nombre,
        }).first();

      if (existente && existente.id !== categoria.id) {
        throw new ConflictException(
          `La categoría ${nombre} ya se encuentra registrada`,
        );
      }
    }

    return this.databaseService.db.orm.public.Categoria.where({ id }).update({
      ...(nombre !== undefined && {
        nombre,
      }),

      ...(updateCategoriaDto.descripcion !== undefined && {
        descripcion: updateCategoriaDto.descripcion.trim() || null,
      }),
    });
  }
}
