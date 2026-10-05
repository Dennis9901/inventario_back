import {
  IsInt,
  IsNumber,
  ValidateIf,
  Matches,
  IsString,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

export class UpdateProductoDto {
  @ValidateIf((_object: unknown, value: unknown) => value !== undefined)
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  @Matches(/\S/, { message: 'sku no puede estar vacío' })
  sku?: string;

  @ValidateIf((_object: unknown, value: unknown) => value !== undefined)
  @IsString()
  @MaxLength(100)
  codigoBarras?: string;

  @ValidateIf((_object: unknown, value: unknown) => value !== undefined)
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  @Matches(/\S/, { message: 'nombre no puede estar vacío' })
  nombre?: string;

  @ValidateIf((_object: unknown, value: unknown) => value !== undefined)
  @IsString()
  @MaxLength(500)
  descripcion?: string;

  @ValidateIf((_object: unknown, value: unknown) => value !== undefined)
  @IsNumber({
    maxDecimalPlaces: 2,
  })
  @Min(0)
  costo?: number;

  @ValidateIf((_object: unknown, value: unknown) => value !== undefined)
  @IsNumber({
    maxDecimalPlaces: 2,
  })
  @Min(0)
  precio?: number;

  @ValidateIf((_object: unknown, value: unknown) => value !== undefined)
  @IsInt()
  @Min(0)
  stockMinimo?: number;

  @ValidateIf((_object: unknown, value: unknown) => value !== undefined)
  @IsString()
  @MaxLength(50)
  @Matches(/\S/, { message: 'unidadMedida no puede estar vacío' })
  unidadMedida?: string;

  @ValidateIf((_object: unknown, value: unknown) => value !== undefined)
  @IsInt()
  @Min(1)
  categoriaId?: number;
}
