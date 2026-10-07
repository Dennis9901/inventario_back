import { ApiProperty } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  IsBoolean,
  IsIn,
  IsInt,
  IsISO8601,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

export class PaginacionQueryDto {
  @ApiProperty({
    required: false,
    type: 'integer',
    format: 'int32',
    example: 1,
    minimum: 1,
    maximum: 2147483647,
    default: 1,
  })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(2147483647)
  page = 1;

  @ApiProperty({
    required: false,
    type: 'integer',
    format: 'int32',
    example: 1,
    minimum: 1,
    maximum: 100,
    default: 20,
  })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit = 20;
}

export class MovimientoProductoQueryDto extends PaginacionQueryDto {
  @ApiProperty({
    required: false,
    type: String,
    enum: ['ENTRADA', 'SALIDA', 'AJUSTE'],
  })
  @IsOptional()
  @IsIn(['ENTRADA', 'SALIDA', 'AJUSTE'])
  tipo?: 'ENTRADA' | 'SALIDA' | 'AJUSTE';

  @ApiProperty({
    required: false,
    type: String,
    example: '2026-10-01',
    description: 'Día UTC o timestamp con zona explícita; ver API.md',
  })
  @IsOptional()
  @IsISO8601({ strict: true })
  @Matches(/^\d{4}-\d{2}-\d{2}(?:T.*(?:Z|[+-]\d{2}:\d{2}))?$/)
  fechaInicio?: string;

  @ApiProperty({
    required: false,
    type: String,
    example: '2026-10-01',
    description: 'Día UTC o timestamp con zona explícita; ver API.md',
  })
  @IsOptional()
  @IsISO8601({ strict: true })
  @Matches(/^\d{4}-\d{2}-\d{2}(?:T.*(?:Z|[+-]\d{2}:\d{2}))?$/)
  fechaFin?: string;

  @ApiProperty({
    required: false,
    type: String,
    enum: ['createdAt', 'tipo', 'cantidad', 'stockAnterior', 'stockNuevo'],
    default: 'createdAt',
  })
  @IsIn(['createdAt', 'tipo', 'cantidad', 'stockAnterior', 'stockNuevo'])
  sortBy: 'createdAt' | 'tipo' | 'cantidad' | 'stockAnterior' | 'stockNuevo' =
    'createdAt';

  @ApiProperty({
    required: false,
    type: String,
    enum: ['asc', 'desc'],
    default: 'desc',
  })
  @IsIn(['asc', 'desc'])
  sortOrder: 'asc' | 'desc' = 'desc';
}

export class MovimientoQueryDto extends MovimientoProductoQueryDto {
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
  productoId?: number;

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
  usuarioId?: number;
}

export class ExistenciaQueryDto extends PaginacionQueryDto {
  @ApiProperty({
    required: false,
    type: String,
    example: 'ejemplo',
    maxLength: 200,
  })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  search?: string;

  @ApiProperty({ required: false, type: Boolean, example: true })
  @IsOptional()
  @IsBoolean()
  @Transform(({ value }: { value: unknown }) =>
    value === 'true' ? true : value === 'false' ? false : value,
  )
  stockBajo?: boolean;
}
