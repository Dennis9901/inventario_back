import { Auditar } from '../../common/http/auditar.decorator.js';
import {
  ApiModulo,
  ApiResultado,
} from '../../common/http/api-docs.decorator.js';
import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import { UsuariosService } from './usuarios.service.js';
import { CreateUsuarioDto } from './dto/create-usuario.dto.js';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { RolesGuard } from '../auth/guards/roles.guard.js';
import { Roles } from '../auth/decorators/roles.decorator.js';

@ApiModulo('Usuarios', true)
@Controller('usuarios')
@UseGuards(JwtAuthGuard, RolesGuard)
export class UsuariosController {
  constructor(private readonly usuariosService: UsuariosService) {}

  @ApiResultado('Usuario', 200, 'array', 'Usuarios: findAll')
  @Get()
  findAll() {
    return this.usuariosService.findAll();
  }

  @ApiResultado('Usuario', 201, 'objeto', 'Usuarios: create')
  @Auditar('USUARIO_CREADO', 'USUARIO')
  @Post()
  @Roles('ADMINISTRADOR')
  create(@Body() createUsuarioDto: CreateUsuarioDto) {
    return this.usuariosService.create(createUsuarioDto);
  }
}
