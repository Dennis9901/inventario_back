import { ApiProperty } from '@nestjs/swagger';
import { IsInt, IsNumber, Max, Min } from 'class-validator';

export class CompraDetalleDto {
  @ApiProperty({
    required: true,
    type: 'integer',
    format: 'int32',
    example: 1,
    minimum: 1,
    maximum: 2147483647,
  })
  @IsInt()
  @Min(1)
  @Max(2147483647)
  productoId!: number;
  @ApiProperty({
    required: true,
    type: 'integer',
    format: 'int32',
    example: 1,
    minimum: 1,
    maximum: 2147483647,
  })
  @IsInt()
  @Min(1)
  @Max(2147483647)
  cantidad!: number;
  @ApiProperty({
    required: true,
    type: Number,
    example: 1,
    minimum: 0,
    maximum: 1_000_000_000_000,
  })
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(1_000_000_000_000)
  costoUnitario!: number;
}
