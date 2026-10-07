import { ApiProperty, PartialType } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  IsBoolean,
  IsInt,
  IsISO8601,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateIf,
} from 'class-validator';
import { PaginacionQueryDto } from '../../inventario/dto/consulta-inventario.dto.js';
const opcional = (_o: unknown, v: unknown) => v !== undefined;
const trim = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;
export class CreateListaPrecioDto {
  @ApiProperty({ example: 'CLINICA', maxLength: 40 })
  @Transform(trim)
  @IsString()
  @Matches(/^[A-Z][A-Z0-9_-]{0,39}$/)
  codigo!: string;
  @ApiProperty({ example: 'Clínica', maxLength: 120 })
  @Transform(trim)
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  nombre!: string;
  @ApiProperty({ required: false, maxLength: 500 })
  @ValidateIf(opcional)
  @Transform(trim)
  @IsString()
  @MaxLength(500)
  descripcion?: string;
}
// El código es identidad estable; no se cambia mediante PATCH.
export class UpdateListaPrecioDto extends PartialType(CreateListaPrecioDto, {
  skipNullProperties: false,
}) {}
export class ListaPrecioQueryDto extends PaginacionQueryDto {
  @ApiProperty({ required: false, maxLength: 200 })
  @ValidateIf(opcional)
  @Transform(trim)
  @IsString()
  @MaxLength(200)
  search?: string;
  @ApiProperty({ required: false, type: Boolean })
  @ValidateIf(opcional)
  @Transform(({ value }: { value: unknown }) =>
    value === 'true' ? true : value === 'false' ? false : value,
  )
  @IsBoolean()
  activo?: boolean;
}
export class ProductoPrecioQueryDto extends ListaPrecioQueryDto {
  @ApiProperty({ required: false, type: 'integer', minimum: 1 })
  @ValidateIf(opcional)
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(2147483647)
  productoId?: number;
  @ApiProperty({
    required: false,
    type: String,
    format: 'date-time',
    description:
      'Timestamp con zona; normalizado a UTC. Intervalo [desde, hasta).',
  })
  @ValidateIf(opcional)
  @IsISO8601({ strict: true })
  @Matches(/^\d{4}-\d{2}-\d{2}T.*(?:Z|[+-]\d{2}:\d{2})$/)
  vigenteEn?: string;
}
export class CreateProductoPrecioDto {
  @ApiProperty({ type: 'integer', minimum: 1 })
  @IsInt()
  @Min(1)
  @Max(2147483647)
  productoId!: number;
  @ApiProperty({
    type: String,
    example: '135.00',
    description: 'Decimal exacto no negativo, máximo 10^12 y dos decimales.',
  })
  @IsString()
  @Matches(/^\d{1,13}(?:\.\d{1,2})?$/)
  precio!: string;
  @ApiProperty({ type: String, format: 'date-time' })
  @IsISO8601({ strict: true })
  @Matches(/^\d{4}-\d{2}-\d{2}T.*(?:Z|[+-]\d{2}:\d{2})$/)
  vigenciaDesde!: string;
  @ApiProperty({
    required: false,
    nullable: true,
    type: String,
    format: 'date-time',
  })
  @ValidateIf((_o: unknown, v: unknown) => v !== undefined && v !== null)
  @IsISO8601({ strict: true })
  @Matches(/^\d{4}-\d{2}-\d{2}T.*(?:Z|[+-]\d{2}:\d{2})$/)
  vigenciaHasta?: string | null;
}
export class UpdateProductoPrecioDto {
  @ApiProperty({
    required: false,
    type: String,
    format: 'date-time',
    description:
      'Solo cerrar/reducir una vigencia futura. No editar precio ni inicio.',
  })
  @ValidateIf(opcional)
  @IsISO8601({ strict: true })
  @Matches(/^\d{4}-\d{2}-\d{2}T.*(?:Z|[+-]\d{2}:\d{2})$/)
  vigenciaHasta?: string;
}
export class ResolverPrecioQueryDto {
  @ApiProperty({
    required: false,
    type: 'integer',
    minimum: 1,
    description:
      'Sin lista usa Producto.precio. Sin precio vigente usa el mismo fallback.',
  })
  @ValidateIf(opcional)
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(2147483647)
  listaPrecioId?: number;
}
