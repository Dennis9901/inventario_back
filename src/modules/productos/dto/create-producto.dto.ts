import { ApiProperty } from '@nestjs/swagger';
import {
  IsInt,
  IsNotEmpty,
  IsNumber,
  ValidateIf,
  Matches,
  IsString,
  MaxLength,
  Min,
} from 'class-validator';

export class CreateProductoDto {
  @ApiProperty({
    required: true,
    type: String,
    example: 'EJEMPLO-001',
    maxLength: 100,
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  @Matches(/\S/, { message: 'sku no puede estar vacío' })
  sku!: string;

  @ApiProperty({
    required: false,
    type: String,
    example: 'Texto de ejemplo',
    maxLength: 100,
  })
  @ValidateIf((_object: unknown, value: unknown) => value !== undefined)
  @IsString()
  @MaxLength(100)
  codigoBarras?: string;

  @ApiProperty({
    required: true,
    type: String,
    example: 'Dato ficticio',
    maxLength: 200,
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  @Matches(/\S/, { message: 'nombre no puede estar vacío' })
  nombre!: string;

  @ApiProperty({
    required: false,
    type: String,
    example: 'Texto de ejemplo',
    maxLength: 500,
  })
  @ValidateIf((_object: unknown, value: unknown) => value !== undefined)
  @IsString()
  @MaxLength(500)
  descripcion?: string;

  @ApiProperty({ required: true, type: Number, example: 1, minimum: 0 })
  @IsNumber({
    maxDecimalPlaces: 2,
  })
  @Min(0)
  costo!: number;

  @ApiProperty({ required: true, type: Number, example: 1, minimum: 0 })
  @IsNumber({
    maxDecimalPlaces: 2,
  })
  @Min(0)
  precio!: number;

  @ApiProperty({
    required: true,
    type: 'integer',
    format: 'int32',
    example: 1,
    minimum: 0,
  })
  @IsInt()
  @Min(0)
  stockMinimo!: number;

  @ApiProperty({
    required: false,
    type: String,
    example: 'Texto de ejemplo',
    maxLength: 50,
  })
  @ValidateIf((_object: unknown, value: unknown) => value !== undefined)
  @IsString()
  @MaxLength(50)
  @Matches(/\S/, { message: 'unidadMedida no puede estar vacío' })
  unidadMedida?: string;

  @ApiProperty({
    required: true,
    type: 'integer',
    format: 'int32',
    example: 1,
    minimum: 1,
  })
  @IsInt()
  @Min(1)
  categoriaId!: number;

  @ApiProperty({
    required: false,
    type: String,
    maxLength: 50,
    example: 'Dato ficticio',
  })
  @ValidateIf((_o: unknown, v: unknown) => v !== undefined)
  @IsString()
  @MaxLength(50)
  claveProductoServicioSat?: string;

  @ApiProperty({
    required: false,
    type: String,
    maxLength: 10,
    example: 'Dato ficticio',
  })
  @ValidateIf((_o: unknown, v: unknown) => v !== undefined)
  @IsString()
  @MaxLength(10)
  objetoImpuestoSat?: string;

  @ApiProperty({
    required: false,
    type: 'integer',
    minimum: 1,
    description:
      'Referencia opcional al catálogo; unidadMedida legacy se conserva.',
  })
  @ValidateIf((_o: unknown, v: unknown) => v !== undefined)
  @IsInt()
  @Min(1)
  unidadMedidaId?: number;
}
