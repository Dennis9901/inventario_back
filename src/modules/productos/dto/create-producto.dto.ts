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
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  @Matches(/\S/, { message: 'sku no puede estar vacío' })
  sku!: string;

  @ValidateIf((_object: unknown, value: unknown) => value !== undefined)
  @IsString()
  @MaxLength(100)
  codigoBarras?: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  @Matches(/\S/, { message: 'nombre no puede estar vacío' })
  nombre!: string;

  @ValidateIf((_object: unknown, value: unknown) => value !== undefined)
  @IsString()
  @MaxLength(500)
  descripcion?: string;

  @IsNumber({
    maxDecimalPlaces: 2,
  })
  @Min(0)
  costo!: number;

  @IsNumber({
    maxDecimalPlaces: 2,
  })
  @Min(0)
  precio!: number;

  @IsInt()
  @Min(0)
  stockMinimo!: number;

  @ValidateIf((_object: unknown, value: unknown) => value !== undefined)
  @IsString()
  @MaxLength(50)
  @Matches(/\S/, { message: 'unidadMedida no puede estar vacío' })
  unidadMedida?: string;

  @IsInt()
  @Min(1)
  categoriaId!: number;
}
