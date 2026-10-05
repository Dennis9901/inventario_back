import { Transform, Type } from 'class-transformer';
import {
  IsIn,
  IsISO8601,
  Matches,
  IsInt,
  IsString,
  Max,
  MaxLength,
  Min,
  ValidateIf,
} from 'class-validator';
import { PaginacionQueryDto } from '../../inventario/dto/consulta-inventario.dto.js';

export class CompraQueryDto extends PaginacionQueryDto {
  @ValidateIf((_o: unknown, v: unknown) => v !== undefined)
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(2147483647)
  proveedorId?: number;

  @ValidateIf((_o: unknown, v: unknown) => v !== undefined)
  @IsIn(['BORRADOR', 'RECIBIDA', 'CANCELADA'])
  estado?: 'BORRADOR' | 'RECIBIDA' | 'CANCELADA';

  @ValidateIf((_o: unknown, v: unknown) => v !== undefined)
  @IsISO8601({ strict: true })
  @Matches(/^\d{4}-\d{2}-\d{2}(?:T.*(?:Z|[+-]\d{2}:\d{2}))?$/)
  fechaInicio?: string;

  @ValidateIf((_o: unknown, v: unknown) => v !== undefined)
  @IsISO8601({ strict: true })
  @Matches(/^\d{4}-\d{2}-\d{2}(?:T.*(?:Z|[+-]\d{2}:\d{2}))?$/)
  fechaFin?: string;

  @ValidateIf((_o: unknown, v: unknown) => v !== undefined)
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString()
  @MaxLength(200)
  search?: string;

  @IsIn(['createdAt', 'folio', 'estado', 'total'])
  sortBy: 'createdAt' | 'folio' | 'estado' | 'total' = 'createdAt';
  @IsIn(['asc', 'desc'])
  sortOrder: 'asc' | 'desc' = 'desc';
}
