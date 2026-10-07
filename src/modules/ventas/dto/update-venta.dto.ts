import { ApiProperty } from '@nestjs/swagger';
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
  @ApiProperty({
    required: false,
    nullable: true,
    type: 'integer',
    minimum: 1,
    description:
      'Lista activa opcional. Sin lista conserva Producto.precio; null en PATCH vuelve al precio base. Cambio en BORRADOR recalcula todas las líneas.',
  })
  @ValidateIf((_o: unknown, v: unknown) => v !== undefined && v !== null)
  @IsInt()
  @Min(1)
  @Max(2147483647)
  listaPrecioId?: number | null;

  @ApiProperty({
    required: false,
    type: 'integer',
    format: 'int32',
    example: 1,
    minimum: 1,
    maximum: 2147483647,
  })
  @ValidateIf((_o: unknown, v: unknown) => v !== undefined)
  @IsInt()
  @Min(1)
  @Max(2147483647)
  clienteId?: number;

  @ApiProperty({
    required: false,
    type: String,
    example: 'Texto de ejemplo',
    maxLength: 500,
  })
  @ValidateIf((_o: unknown, v: unknown) => v !== undefined)
  @IsString()
  @MaxLength(500)
  observacion?: string;

  @ApiProperty({
    required: false,
    type: Number,
    example: 1,
    minimum: 0,
    maximum: 1_000_000_000_000,
  })
  @ValidateIf((_o: unknown, v: unknown) => v !== undefined)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(1_000_000_000_000)
  impuestos?: number;

  @ApiProperty({
    required: false,
    type: () => VentaDetalleDto,
    isArray: true,
    minItems: 1,
    maxItems: 100,
  })
  @ValidateIf((_o: unknown, v: unknown) => v !== undefined)
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(100)
  @ValidateNested({ each: true })
  @Type(() => VentaDetalleDto)
  detalles?: VentaDetalleDto[];
}
