import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { VentasService } from './ventas.service.js';
import { CreateVentaDto } from './dto/create-venta.dto.js';
import { UpdateVentaDto } from './dto/update-venta.dto.js';
import { VentaQueryDto } from './dto/venta-query.dto.js';
import { SinCuerpoPipe } from '../../common/sin-cuerpo.pipe.js';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { RolesGuard } from '../auth/guards/roles.guard.js';
import { Roles } from '../auth/decorators/roles.decorator.js';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import type { JwtPayload } from '../auth/interfaces/jwt-payload.interface.js';

@Controller('ventas')
@UseGuards(JwtAuthGuard, RolesGuard)
export class VentasController {
  constructor(private readonly service: VentasService) {}
  @Get()
  findAll(@Query() query: VentaQueryDto) {
    return this.service.findAll(query);
  }
  @Get(':id')
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.service.findOne(id);
  }
  @Post()
  @Roles('ADMINISTRADOR')
  create(@Body() dto: CreateVentaDto, @CurrentUser() usuario: JwtPayload) {
    return this.service.create(dto, usuario.sub);
  }
  @Patch(':id')
  @Roles('ADMINISTRADOR')
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateVentaDto,
    @CurrentUser() usuario: JwtPayload,
  ) {
    return this.service.update(id, dto, usuario.sub);
  }
  @Delete(':id')
  @Roles('ADMINISTRADOR')
  remove(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() usuario: JwtPayload,
  ) {
    return this.service.remove(id, usuario.sub);
  }
  @Post(':id/confirmar')
  @Roles('ADMINISTRADOR')
  confirmar(
    @Param('id', ParseIntPipe) id: number,
    @Body(new SinCuerpoPipe()) _body: unknown,
    @CurrentUser() usuario: JwtPayload,
  ) {
    return this.service.confirmar(id, usuario.sub);
  }
  @Post(':id/cancelar')
  @Roles('ADMINISTRADOR')
  cancelar(
    @Param('id', ParseIntPipe) id: number,
    @Body(new SinCuerpoPipe()) _body: unknown,
    @CurrentUser() usuario: JwtPayload,
  ) {
    return this.service.cancelar(id, usuario.sub);
  }
}
