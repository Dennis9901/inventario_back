import { ApiProperty } from '@nestjs/swagger';
import { IsString, MaxLength, ValidateIf } from 'class-validator';
export class DomicilioClienteDto {
  @ApiProperty({
    required: false,
    type: String,
    maxLength: 200,
    example: 'Dato ficticio',
  })
  @ValidateIf((_o: unknown, v: unknown) => v !== undefined)
  @IsString()
  @MaxLength(200)
  pais?: string;

  @ApiProperty({
    required: false,
    type: String,
    maxLength: 200,
    example: 'Dato ficticio',
  })
  @ValidateIf((_o: unknown, v: unknown) => v !== undefined)
  @IsString()
  @MaxLength(200)
  estado?: string;

  @ApiProperty({
    required: false,
    type: String,
    maxLength: 200,
    example: 'Dato ficticio',
  })
  @ValidateIf((_o: unknown, v: unknown) => v !== undefined)
  @IsString()
  @MaxLength(200)
  municipio?: string;

  @ApiProperty({
    required: false,
    type: String,
    maxLength: 200,
    example: 'Dato ficticio',
  })
  @ValidateIf((_o: unknown, v: unknown) => v !== undefined)
  @IsString()
  @MaxLength(200)
  localidad?: string;

  @ApiProperty({
    required: false,
    type: String,
    maxLength: 200,
    example: 'Dato ficticio',
  })
  @ValidateIf((_o: unknown, v: unknown) => v !== undefined)
  @IsString()
  @MaxLength(200)
  colonia?: string;

  @ApiProperty({
    required: false,
    type: String,
    maxLength: 200,
    example: 'Dato ficticio',
  })
  @ValidateIf((_o: unknown, v: unknown) => v !== undefined)
  @IsString()
  @MaxLength(200)
  calle?: string;

  @ApiProperty({
    required: false,
    type: String,
    maxLength: 200,
    example: 'Dato ficticio',
  })
  @ValidateIf((_o: unknown, v: unknown) => v !== undefined)
  @IsString()
  @MaxLength(200)
  referencia?: string;

  @ApiProperty({
    required: false,
    type: String,
    maxLength: 20,
    example: 'Dato ficticio',
  })
  @ValidateIf((_o: unknown, v: unknown) => v !== undefined)
  @IsString()
  @MaxLength(20)
  codigoPostal?: string;

  @ApiProperty({
    required: false,
    type: String,
    maxLength: 50,
    example: 'Dato ficticio',
  })
  @ValidateIf((_o: unknown, v: unknown) => v !== undefined)
  @IsString()
  @MaxLength(50)
  numeroExterior?: string;

  @ApiProperty({
    required: false,
    type: String,
    maxLength: 50,
    example: 'Dato ficticio',
  })
  @ValidateIf((_o: unknown, v: unknown) => v !== undefined)
  @IsString()
  @MaxLength(50)
  numeroInterior?: string;
}
