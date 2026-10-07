import { Auditar } from '../../common/http/auditar.decorator.js';
import {
  ApiModulo,
  ApiResultado,
} from '../../common/http/api-docs.decorator.js';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { RolesGuard } from '../auth/guards/roles.guard.js';
import { Roles } from '../auth/decorators/roles.decorator.js';
import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import { RolesService } from './roles.service.js';
import { CreateRolDto } from './dto/create-rol.dto.js';

@ApiModulo('Roles', true)
@Controller('roles')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('ADMINISTRADOR')
export class RolesController {
  constructor(private readonly rolesService: RolesService) {}

  @ApiResultado('Rol', 200, 'array', 'Roles: findAll')
  @Get()
  findAll() {
    return this.rolesService.findAll();
  }

  @ApiResultado('Rol', 201, 'objeto', 'Roles: create')
  @Auditar('ROL_CREADO', 'ROL')
  @Post()
  create(@Body() createRolDto: CreateRolDto) {
    return this.rolesService.create(createRolDto);
  }
}
