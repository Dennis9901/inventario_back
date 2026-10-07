import { ApiProperty, PartialType } from '@nestjs/swagger';
import { IsString, Matches, MaxLength } from 'class-validator';
import { Transform } from 'class-transformer';
export class CreateUnidadMedidaDto {
  @ApiProperty({ example: 'XBX', maxLength: 50 })
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim().toUpperCase() : value,
  )
  @IsString()
  @Matches(/\S/)
  @MaxLength(50)
  clave!: string;
  @ApiProperty({ example: 'CAJA', maxLength: 200 })
  @IsString()
  @Matches(/\S/)
  @MaxLength(200)
  nombre!: string;
}
export class UpdateUnidadMedidaDto extends PartialType(CreateUnidadMedidaDto, {
  skipNullProperties: false,
}) {}
