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
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(2147483647)
  page = 1;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit = 20;
}

export class MovimientoProductoQueryDto extends PaginacionQueryDto {
  @IsOptional()
  @IsIn(['ENTRADA', 'SALIDA', 'AJUSTE'])
  tipo?: 'ENTRADA' | 'SALIDA' | 'AJUSTE';

  @IsOptional()
  @IsISO8601({ strict: true })
  @Matches(/^\d{4}-\d{2}-\d{2}(?:T.*(?:Z|[+-]\d{2}:\d{2}))?$/)
  fechaInicio?: string;

  @IsOptional()
  @IsISO8601({ strict: true })
  @Matches(/^\d{4}-\d{2}-\d{2}(?:T.*(?:Z|[+-]\d{2}:\d{2}))?$/)
  fechaFin?: string;

  @IsIn(['createdAt', 'tipo', 'cantidad', 'stockAnterior', 'stockNuevo'])
  sortBy: 'createdAt' | 'tipo' | 'cantidad' | 'stockAnterior' | 'stockNuevo' =
    'createdAt';

  @IsIn(['asc', 'desc'])
  sortOrder: 'asc' | 'desc' = 'desc';
}

export class MovimientoQueryDto extends MovimientoProductoQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(2147483647)
  productoId?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(2147483647)
  usuarioId?: number;
}

export class ExistenciaQueryDto extends PaginacionQueryDto {
  @IsOptional()
  @IsString()
  @MaxLength(200)
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  search?: string;

  @IsOptional()
  @IsBoolean()
  @Transform(({ value }: { value: unknown }) =>
    value === 'true' ? true : value === 'false' ? false : value,
  )
  stockBajo?: boolean;
}
