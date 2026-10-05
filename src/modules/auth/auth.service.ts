import { Injectable, UnauthorizedException } from '@nestjs/common';

import { JwtService } from '@nestjs/jwt';
import * as argon2 from 'argon2';

import { DatabaseService } from '../../database/database.service.js';
import { LoginDto } from './dto/login.dto.js';

@Injectable()
export class AuthService {
  constructor(
    private readonly databaseService: DatabaseService,
    private readonly jwtService: JwtService,
  ) {}

  async login(loginDto: LoginDto) {
    const email = loginDto.email.trim().toLowerCase();


    const usuario = await this.databaseService.db.orm.public.Usuario.where({
      email,
    }).first();

    if (!usuario) {
      throw new UnauthorizedException('Credenciales incorrectas');
    }

    if (!usuario.activo) {
      throw new UnauthorizedException('El usuario se encuentra inactivo');
    }

    const passwordValido = await argon2.verify(
      usuario.password,
      loginDto.password,
    );

    if (!passwordValido) {
      throw new UnauthorizedException('Credenciales incorrectas');
    }


    const rol = await this.databaseService.db.orm.public.Rol.where({
      id: usuario.rolId,
    }).first();

    if (!rol || !rol.activo) {
      throw new UnauthorizedException('El usuario no tiene un rol válido');
    }

    const payload = {
      sub: usuario.id,
      email: usuario.email,
      rolId: usuario.rolId,
      rol: rol.nombre,
    };

    const accessToken = await this.jwtService.signAsync(payload);

    return {
      access_token: accessToken,
      token_type: 'Bearer',
      expires_in: '8h',
      usuario: {
        id: usuario.id,
        nombre: usuario.nombre,
        apellido: usuario.apellido,
        email: usuario.email,
        rolId: usuario.rolId,
      },
    };
  }
}
