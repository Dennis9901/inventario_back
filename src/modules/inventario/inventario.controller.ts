import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { RolesGuard } from '../auth/guards/roles.guard.js';
import { Roles } from '../auth/decorators/roles.decorator.js';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import type { JwtPayload } from '../auth/interfaces/jwt-payload.interface.js';
import { InventarioService } from './inventario.service.js';
import { EntradaInventarioDto } from './dto/entrada-inventario.dto.js';
import { SalidaInventarioDto } from './dto/salida-inventario.dto.js';
import { AjusteInventarioDto } from './dto/ajuste-inventario.dto.js';

import {
  ExistenciaQueryDto,
  MovimientoQueryDto,
  MovimientoProductoQueryDto,
} from './dto/consulta-inventario.dto.js';

@Controller('inventario')
@UseGuards(JwtAuthGuard, RolesGuard)
export class InventarioController {
  constructor(private readonly inventarioService: InventarioService) {}

  @Get('existencias')
  findExistencias(@Query() query: ExistenciaQueryDto) {
    return this.inventarioService.findExistencias(query);
  }

  @Get('existencias/:productoId')
  findExistencia(@Param('productoId', ParseIntPipe) productoId: number) {
    return this.inventarioService.findExistencia(productoId);
  }

  @Post('movimientos/entrada')
  @Roles('ADMINISTRADOR')
  entrada(
    @Body() dto: EntradaInventarioDto,
    @CurrentUser() usuario: JwtPayload,
  ) {
    return this.inventarioService.entrada(dto, usuario.sub);
  }

  @Post('movimientos/salida')
  @Roles('ADMINISTRADOR')
  salida(@Body() dto: SalidaInventarioDto, @CurrentUser() usuario: JwtPayload) {
    return this.inventarioService.salida(dto, usuario.sub);
  }

  @Post('movimientos/ajuste')
  @Roles('ADMINISTRADOR')
  ajuste(@Body() dto: AjusteInventarioDto, @CurrentUser() usuario: JwtPayload) {
    return this.inventarioService.ajuste(dto, usuario.sub);
  }

  @Get('movimientos')
  findMovimientos(@Query() query: MovimientoQueryDto) {
    return this.inventarioService.findMovimientos(query);
  }

  @Get('movimientos/producto/:productoId')
  findMovimientosProducto(
    @Param('productoId', ParseIntPipe) productoId: number,
    @Query() query: MovimientoProductoQueryDto,
  ) {
    return this.inventarioService.findMovimientosProducto(productoId, query);
  }

  @Get('kardex/:productoId')
  findKardex(
    @Param('productoId', ParseIntPipe) productoId: number,
    @Query() query: MovimientoProductoQueryDto,
  ) {
    return this.inventarioService.findKardex(productoId, query);
  }
}
