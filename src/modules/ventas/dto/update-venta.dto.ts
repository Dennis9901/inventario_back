import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsInt,
  IsNumber,
  IsString,
  Max,
  MaxLength,
  Min,
  ValidateIf,
  ValidateNested,
} from 'class-validator';
import { VentaDetalleDto } from './venta-detalle.dto.js';

export class UpdateVentaDto {
  @ValidateIf((_o: unknown, v: unknown) => v !== undefined)
  @IsInt()
  @Min(1)
  @Max(2147483647)
  clienteId?: number;

  @ValidateIf((_o: unknown, v: unknown) => v !== undefined)
  @IsString()
  @MaxLength(500)
  observacion?: string;

  @ValidateIf((_o: unknown, v: unknown) => v !== undefined)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(1_000_000_000_000)
  impuestos?: number;

  @ValidateIf((_o: unknown, v: unknown) => v !== undefined)
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(100)
  @ValidateNested({ each: true })
  @Type(() => VentaDetalleDto)
  detalles?: VentaDetalleDto[];
}
