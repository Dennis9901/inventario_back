import { IsInt, IsNumber, Max, Min } from 'class-validator';

export class CompraDetalleDto {
  @IsInt()
  @Min(1)
  @Max(2147483647)
  productoId!: number;
  @IsInt()
  @Min(1)
  @Max(2147483647)
  cantidad!: number;
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(1_000_000_000_000)
  costoUnitario!: number;
}
