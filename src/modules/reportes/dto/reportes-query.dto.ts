import { ApiProperty } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import { IsBoolean, IsInt, IsOptional, Max, Min } from 'class-validator';
import { VentaQueryDto } from '../../ventas/dto/venta-query.dto.js';
import { CompraQueryDto } from '../../compras/dto/compra-query.dto.js';
import {
  ExistenciaQueryDto,
  MovimientoQueryDto,
} from '../../inventario/dto/consulta-inventario.dto.js';
import { DashboardSerieQueryDto } from '../../dashboard/dto/dashboard-query.dto.js';

export class ReporteVentasQueryDto extends VentaQueryDto {
  @ApiProperty({
    required: false,
    type: String,
    enum: ['BORRADOR', 'CONFIRMADA', 'CANCELADA'],
    default: 'CONFIRMADA',
  })
  override estado: 'BORRADOR' | 'CONFIRMADA' | 'CANCELADA' = 'CONFIRMADA';
}
export class ReporteComprasQueryDto extends CompraQueryDto {
  @ApiProperty({
    required: false,
    type: String,
    enum: ['BORRADOR', 'RECIBIDA', 'CANCELADA'],
    default: 'RECIBIDA',
  })
  override estado: 'BORRADOR' | 'RECIBIDA' | 'CANCELADA' = 'RECIBIDA';
}
export class ReporteUtilidadQueryDto extends DashboardSerieQueryDto {}
export class ReporteKardexQueryDto extends MovimientoQueryDto {}
export class ReporteInventarioQueryDto extends ExistenciaQueryDto {
  @ApiProperty({
    required: false,
    type: 'integer',
    format: 'int32',
    example: 1,
    minimum: 1,
    maximum: 2147483647,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(2147483647)
  categoriaId?: number;

  @ApiProperty({ required: false, type: Boolean, example: true })
  @IsOptional()
  @IsBoolean()
  @Transform(({ value }: { value: unknown }) =>
    value === 'true' ? true : value === 'false' ? false : value,
  )
  sinExistencia?: boolean;

  @ApiProperty({ required: false, type: Boolean, example: true })
  @IsOptional()
  @IsBoolean()
  @Transform(({ value }: { value: unknown }) =>
    value === 'true' ? true : value === 'false' ? false : value,
  )
  activo?: boolean;
}
