import { ApiProperty } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  IsIn,
  IsInt,
  IsISO8601,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  ValidateIf,
} from 'class-validator';
import { PaginacionQueryDto } from '../../inventario/dto/consulta-inventario.dto.js';

export class DevolucionQueryDto extends PaginacionQueryDto {
  @ApiProperty({
    required: false,
    type: String,
    enum: ['BORRADOR', 'PROCESADA', 'CANCELADA'],
  })
  @ValidateIf((_o: unknown, v: unknown) => v !== undefined)
  @IsIn(['BORRADOR', 'PROCESADA', 'CANCELADA'])
  estado?: 'BORRADOR' | 'PROCESADA' | 'CANCELADA';
  @ApiProperty({
    required: false,
    type: String,
    example: '2026-10-01',
    description: 'Día UTC o timestamp con zona explícita; ver API.md',
  })
  @ValidateIf((_o: unknown, v: unknown) => v !== undefined)
  @IsISO8601({ strict: true })
  @Matches(/^\d{4}-\d{2}-\d{2}(?:T.*(?:Z|[+-]\d{2}:\d{2}))?$/)
  fechaInicio?: string;
  @ApiProperty({
    required: false,
    type: String,
    example: '2026-10-01',
    description: 'Día UTC o timestamp con zona explícita; ver API.md',
  })
  @ValidateIf((_o: unknown, v: unknown) => v !== undefined)
  @IsISO8601({ strict: true })
  @Matches(/^\d{4}-\d{2}-\d{2}(?:T.*(?:Z|[+-]\d{2}:\d{2}))?$/)
  fechaFin?: string;
  @ApiProperty({
    required: false,
    type: String,
    example: 'ejemplo',
    maxLength: 200,
  })
  @ValidateIf((_o: unknown, v: unknown) => v !== undefined)
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString()
  @MaxLength(200)
  search?: string;
  @ApiProperty({
    required: false,
    type: String,
    enum: ['createdAt', 'folio', 'estado', 'subtotal'],
    default: 'createdAt',
  })
  @IsIn(['createdAt', 'folio', 'estado', 'subtotal'])
  sortBy: 'createdAt' | 'folio' | 'estado' | 'subtotal' = 'createdAt';
  @ApiProperty({
    required: false,
    type: String,
    enum: ['asc', 'desc'],
    default: 'desc',
  })
  @IsIn(['asc', 'desc'])
  sortOrder: 'asc' | 'desc' = 'desc';
}

export class DevolucionVentaQueryDto extends DevolucionQueryDto {
  @ApiProperty({
    required: false,
    type: 'integer',
    format: 'int32',
    example: 1,
    minimum: 1,
    maximum: 2147483647,
  })
  @ValidateIf((_o: unknown, v: unknown) => v !== undefined)
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(2147483647)
  ventaId?: number;
  @ApiProperty({
    required: false,
    type: 'integer',
    format: 'int32',
    example: 1,
    minimum: 1,
    maximum: 2147483647,
  })
  @ValidateIf((_o: unknown, v: unknown) => v !== undefined)
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(2147483647)
  clienteId?: number;
}

export class DevolucionCompraQueryDto extends DevolucionQueryDto {
  @ApiProperty({
    required: false,
    type: 'integer',
    format: 'int32',
    example: 1,
    minimum: 1,
    maximum: 2147483647,
  })
  @ValidateIf((_o: unknown, v: unknown) => v !== undefined)
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(2147483647)
  compraId?: number;
  @ApiProperty({
    required: false,
    type: 'integer',
    format: 'int32',
    example: 1,
    minimum: 1,
    maximum: 2147483647,
  })
  @ValidateIf((_o: unknown, v: unknown) => v !== undefined)
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(2147483647)
  proveedorId?: number;
}
