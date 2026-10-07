import { ApiProperty } from '@nestjs/swagger';
import { Type, Transform } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsInt,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateIf,
  ValidateNested,
} from 'class-validator';

export class DetalleDevolucionVentaDto {
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
  detalleVentaId!: number;
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
}

export class CreateDevolucionVentaDto {
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
  ventaId!: number;
  @ApiProperty({
    required: true,
    type: String,
    example: 'Texto de ejemplo',
    minLength: 1,
    maxLength: 500,
  })
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString()
  @MinLength(1)
  @MaxLength(500)
  motivo!: string;
  @ApiProperty({
    required: false,
    type: String,
    example: 'Texto de ejemplo',
    maxLength: 500,
  })
  @ValidateIf((_o: unknown, v: unknown) => v !== undefined)
  @IsString()
  @MaxLength(500)
  observacion?: string;
  @ApiProperty({
    required: true,
    type: () => DetalleDevolucionVentaDto,
    isArray: true,
    minItems: 1,
    maxItems: 100,
  })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(100)
  @ValidateNested({ each: true })
  @Type(() => DetalleDevolucionVentaDto)
  detalles!: DetalleDevolucionVentaDto[];
}
