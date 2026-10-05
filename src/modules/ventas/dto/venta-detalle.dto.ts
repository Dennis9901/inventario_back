import { IsInt, Max, Min } from 'class-validator';

export class VentaDetalleDto {
  @IsInt()
  @Min(1)
  @Max(2147483647)
  productoId!: number;
  @IsInt()
  @Min(1)
  @Max(2147483647)
  cantidad!: number;
}
