import { ApiProperty } from '@nestjs/swagger';
import { Type, Transform } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsISO8601,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateIf,
  ValidateNested,
} from 'class-validator';
import { PaginacionQueryDto } from '../../inventario/dto/consulta-inventario.dto.js';
const opcional = (_o: unknown, v: unknown) => v !== undefined;
export class ColumnaPrecioDto {
  @ApiProperty({ example: 'Precio Clínica' })
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  columna!: string;
  @ApiProperty({ example: 'CLINICA' })
  @IsString()
  @Matches(/^[A-Z][A-Z0-9_-]{0,39}$/)
  listaCodigo!: string;
}
export class IdentidadPrecioDto {
  @ApiProperty({
    description: 'Identificador textual exacto del archivo; no fuzzy matching.',
  })
  @IsString()
  @MinLength(1)
  @MaxLength(500)
  identificador!: string;
  @ApiProperty({ example: 'HEGA1805' })
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  sku!: string;
}
export class PreviewImportacionDto {
  @ApiProperty({
    required: false,
    enum: ['utf-8', 'windows-1252'],
    default: 'utf-8',
  })
  @IsIn(['utf-8', 'windows-1252'])
  encoding: 'utf-8' | 'windows-1252' = 'utf-8';
  @ApiProperty({ required: false, type: Boolean, default: false })
  @IsBoolean()
  crearUnidadesFaltantes = false;
  @ApiProperty({ required: false, type: Boolean, default: false })
  @IsBoolean()
  crearListasFaltantes = false;
  @ApiProperty({ required: false, minimum: 1, type: 'integer' })
  @ValidateIf(opcional)
  @IsInt()
  @Min(1)
  @Max(2147483647)
  categoriaId?: number;
  @ApiProperty({
    required: false,
    type: String,
    example: '0.00',
    description:
      'Costo explícito para productos nuevos cuando no hay columna Costo; nunca se infiere del precio.',
  })
  @ValidateIf(opcional)
  @IsString()
  @Matches(/^\d{1,13}(?:\.\d{1,2})?$/)
  costoNuevos?: string;
  @ApiProperty({
    required: false,
    maxLength: 120,
    description: 'Obligatoria para XLSX con varias hojas.',
  })
  @ValidateIf(opcional)
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  hoja?: string;
  @ApiProperty({ required: false, minimum: 1, maximum: 50, default: 1 })
  @IsInt()
  @Min(1)
  @Max(50)
  filaEncabezado = 1;
  @ApiProperty({
    required: false,
    default: 'No Identificación',
    description:
      'Columna identificadora de precios. Por defecto contiene SKU; mappingIdentidades permite cruce explícito.',
  })
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  columnaIdentidad = 'No Identificación';
  @ApiProperty({ required: false, type: () => ColumnaPrecioDto, isArray: true })
  @ValidateIf(opcional)
  @IsArray()
  @ArrayMaxSize(10)
  @ValidateNested({ each: true })
  @Type(() => ColumnaPrecioDto)
  columnasPrecios?: ColumnaPrecioDto[];
  @ApiProperty({
    required: false,
    type: () => IdentidadPrecioDto,
    isArray: true,
  })
  @ValidateIf(opcional)
  @IsArray()
  @ArrayMaxSize(2000)
  @ValidateNested({ each: true })
  @Type(() => IdentidadPrecioDto)
  mappingIdentidades?: IdentidadPrecioDto[];
  @ApiProperty({
    required: false,
    format: 'date-time',
    type: String,
    description:
      'Instante del batch de precios. Confirmación debe repetir exactamente el instante normalizado.',
  })
  @ValidateIf(opcional)
  @IsISO8601({ strict: true })
  @Matches(/^\d{4}-\d{2}-\d{2}T.*(?:Z|[+-]\d{2}:\d{2})$/)
  vigenciaDesde?: string;
  @ApiProperty({
    required: false,
    nullable: true,
    format: 'date-time',
    type: String,
  })
  @ValidateIf((_o: unknown, v: unknown) => v !== undefined && v !== null)
  @IsISO8601({ strict: true })
  @Matches(/^\d{4}-\d{2}-\d{2}T.*(?:Z|[+-]\d{2}:\d{2})$/)
  vigenciaHasta?: string | null;
}
export class UploadPreviewDto {
  @ApiProperty({
    required: false,
    type: String,
    description:
      'JSON de PreviewImportacionDto. No admite claves desconocidas.',
    example: '{"encoding":"windows-1252"}',
  })
  @ValidateIf(opcional)
  @IsString()
  @MaxLength(200000)
  opciones?: string;
}
export class ConfirmarImportacionDto {
  @ApiProperty({ type: String, description: 'SHA-256 devuelto en preview.' })
  @IsString()
  @Matches(/^[a-f0-9]{64}$/)
  hashArchivo!: string;
  @ApiProperty({ required: false, type: Boolean, default: false })
  @IsBoolean()
  autorizarActualizaciones = false;
  @ApiProperty({ required: false, type: Boolean, default: false })
  @IsBoolean()
  autorizarCierreVigencias = false;
  @ApiProperty({
    required: false,
    type: String,
    format: 'date-time',
    description: 'Obligatorio para PRECIOS; debe coincidir con preview.',
  })
  @ValidateIf(opcional)
  @IsISO8601({ strict: true })
  @Matches(/^\d{4}-\d{2}-\d{2}T.*(?:Z|[+-]\d{2}:\d{2})$/)
  vigenciaDesde?: string;
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
export class ImportacionQueryDto extends PaginacionQueryDto {
  @ApiProperty({ required: false, enum: ['CLIENTES', 'PRODUCTOS', 'PRECIOS'] })
  @ValidateIf(opcional)
  @IsIn(['CLIENTES', 'PRODUCTOS', 'PRECIOS'])
  tipo?: 'CLIENTES' | 'PRODUCTOS' | 'PRECIOS';
  @ApiProperty({
    required: false,
    enum: ['PREVIEW', 'PROCESANDO', 'COMPLETADA', 'FALLIDA', 'CANCELADA'],
  })
  @ValidateIf(opcional)
  @IsIn(['PREVIEW', 'PROCESANDO', 'COMPLETADA', 'FALLIDA', 'CANCELADA'])
  estado?: 'PREVIEW' | 'PROCESANDO' | 'COMPLETADA' | 'FALLIDA' | 'CANCELADA';
}
export class ImportacionFilaQueryDto extends PaginacionQueryDto {
  @ApiProperty({ required: false, enum: ['VALIDA', 'ADVERTENCIA', 'ERROR'] })
  @ValidateIf(opcional)
  @IsIn(['VALIDA', 'ADVERTENCIA', 'ERROR'])
  estado?: 'VALIDA' | 'ADVERTENCIA' | 'ERROR';
  @ApiProperty({
    required: false,
    maxLength: 200,
    description:
      'Busca solo identidad normalizada (RFC/SKU), no datos personales.',
  })
  @ValidateIf(opcional)
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString()
  @MaxLength(200)
  search?: string;
}
