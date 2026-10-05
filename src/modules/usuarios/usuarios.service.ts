import { ConflictException, Injectable } from '@nestjs/common';
import * as argon2 from 'argon2';
import { DatabaseService } from '../../database/database.service.js';
import { CreateUsuarioDto } from './dto/create-usuario.dto';

@Injectable()
export class UsuariosService {
  constructor(private readonly databaseService: DatabaseService) {}

  async findAll() {
    const usuarios = await this.databaseService.db.orm.public.Usuario.all();

    return usuarios.map(({ password, ...usuario }) => usuario);
  }

  async create(createUsuarioDto: CreateUsuarioDto) {
    const email = createUsuarioDto.email.trim().toLowerCase();

    //Validamos el correo

    const usuarioExistente =
      await this.databaseService.db.orm.public.Usuario.where({ email }).first();

    if (usuarioExistente) {
      throw new ConflictException(
        'El correo electronico ya se encuentra registrado',
      );
    }

    const rol = await this.databaseService.db.orm.public.Rol.where({
      id: createUsuarioDto.rolId,
    }).first();

    if (!rol) {
      throw new ConflictException('El rol especificado se encuentra inactivo');
    }

    const passwordHash = await argon2.hash(createUsuarioDto.password);

    const usuario = await this.databaseService.db.orm.public.Usuario.create({
      nombre: createUsuarioDto.nombre.trim(),
      apellido: createUsuarioDto.apellido?.trim() ?? null,
      email,
      password: passwordHash,
      rolId: createUsuarioDto.rolId,
      activo: true,
    });

    const { password, ...usuarioSeguro } = usuario;

    return usuarioSeguro;
  }
}
