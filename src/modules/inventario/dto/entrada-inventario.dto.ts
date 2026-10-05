import {
  IsInt,
  IsString,
  Max,
  MaxLength,
  Min,
  ValidateIf,
} from 'class-validator';

export class EntradaInventarioDto {
  @IsInt()
  @Min(1)
  @Max(2147483647)
  productoId!: number;

  @IsInt()
  @Min(1)
  @Max(2147483647)
  cantidad!: number;

  @ValidateIf((_object: unknown, value: unknown) => value !== undefined)
  @IsString()
  @MaxLength(500)
  observacion?: string;
}
