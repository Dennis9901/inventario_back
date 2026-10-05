import { Transform } from 'class-transformer';
import { IsString, MaxLength, ValidateIf } from 'class-validator';
import { PaginacionQueryDto } from '../../inventario/dto/consulta-inventario.dto.js';

export class ClienteQueryDto extends PaginacionQueryDto {
  @ValidateIf((_o: unknown, v: unknown) => v !== undefined)
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString()
  @MaxLength(200)
  search?: string;
}
