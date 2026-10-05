import { ConflictException, Injectable } from '@nestjs/common';
import { DatabaseService } from '../../database/database.service.js';
import { CreateRolDto } from './dto/create-rol.dto';

@Injectable()
export class RolesService {
  constructor(private readonly databaseService: DatabaseService) {}

  async findAll() {
    return this.databaseService.db.orm.public.Rol.all();
  }

  async create(createRolDto:CreateRolDto){
    const nombre = createRolDto.nombre.trim().toUpperCase();

    const rolExistente = await this.databaseService.db.orm.public.Rol
      .where({
        nombre,
      }).first();

    if(rolExistente){
      throw new ConflictException(
        `El rol ${nombre} ya se encuentra registrado`,
      )
    }

    return this.databaseService.db.orm.public.Rol.create({
      nombre: createRolDto.nombre,
      descripcion: createRolDto.descripcion ?? null ,
      activo: createRolDto.activo ?? true,
    });
  }
}
