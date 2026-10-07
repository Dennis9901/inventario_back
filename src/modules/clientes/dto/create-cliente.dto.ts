import { Type } from 'class-transformer';
import { ValidateNested, IsObject } from 'class-validator';
import { DomicilioClienteDto } from './domicilio-cliente.dto.js';
import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsEmail,
  IsString,
  Matches,
  MaxLength,
  ValidateIf,
} from 'class-validator';

export class CreateClienteDto {
  @ApiProperty({
    required: true,
    type: String,
    example: 'Dato ficticio',
    maxLength: 200,
  })
  @IsString()
  @Matches(/\S/)
  @MaxLength(200)
  nombre!: string;

  @ApiProperty({
    required: false,
    type: String,
    example: 'Texto de ejemplo',
    maxLength: 200,
  })
  @ValidateIf((_o: unknown, v: unknown) => v !== undefined)
  @IsString()
  @MaxLength(200)
  razonSocial?: string;

  @ApiProperty({
    required: false,
    type: String,
    example: 'Texto de ejemplo',
    maxLength: 100,
  })
  @ValidateIf((_o: unknown, v: unknown) => v !== undefined)
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim().toUpperCase() : value,
  )
  @IsString()
  @MaxLength(100)
  rfc?: string;

  @ApiProperty({
    required: false,
    type: String,
    format: 'email',
    example: 'persona@example.invalid',
    maxLength: 150,
  })
  @ValidateIf((_o: unknown, v: unknown) => v !== undefined)
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim().toLowerCase() : value,
  )
  @IsEmail()
  @MaxLength(150)
  email?: string;

  @ApiProperty({
    required: false,
    type: String,
    example: 'Texto de ejemplo',
    maxLength: 50,
  })
  @ValidateIf((_o: unknown, v: unknown) => v !== undefined)
  @IsString()
  @MaxLength(50)
  telefono?: string;

  @ApiProperty({
    required: false,
    type: String,
    example: 'Texto de ejemplo',
    maxLength: 500,
  })
  @ValidateIf((_o: unknown, v: unknown) => v !== undefined)
  @IsString()
  @MaxLength(500)
  direccion?: string;

  @ApiProperty({
    required: false,
    type: String,
    example: 'Texto de ejemplo',
    maxLength: 200,
  })
  @ValidateIf((_o: unknown, v: unknown) => v !== undefined)
  @IsString()
  @MaxLength(200)
  apellido?: string;

  @ApiProperty({
    required: false,
    type: String,
    maxLength: 200,
    example: 'Dato ficticio',
  })
  @ValidateIf((_o: unknown, v: unknown) => v !== undefined)
  @IsString()
  @MaxLength(200)
  nombreComercial?: string;

  @ApiProperty({
    required: false,
    type: String,
    maxLength: 50,
    example: 'Dato ficticio',
  })
  @ValidateIf((_o: unknown, v: unknown) => v !== undefined)
  @IsString()
  @MaxLength(50)
  regimenFiscal?: string;

  @ApiProperty({
    required: false,
    type: String,
    maxLength: 50,
    example: 'Dato ficticio',
  })
  @ValidateIf((_o: unknown, v: unknown) => v !== undefined)
  @IsString()
  @MaxLength(50)
  usoCfdi?: string;

  @ApiProperty({
    required: false,
    type: String,
    maxLength: 100,
    example: 'Dato ficticio',
  })
  @ValidateIf((_o: unknown, v: unknown) => v !== undefined)
  @IsString()
  @MaxLength(100)
  numeroRegistroTributario?: string;

  @ApiProperty({
    required: false,
    type: String,
    maxLength: 100,
    example: 'Dato ficticio',
  })
  @ValidateIf((_o: unknown, v: unknown) => v !== undefined)
  @IsString()
  @MaxLength(100)
  residenciaFiscal?: string;

  @ApiProperty({
    required: false,
    type: String,
    maxLength: 50,
    example: 'Dato ficticio',
  })
  @ValidateIf((_o: unknown, v: unknown) => v !== undefined)
  @IsString()
  @MaxLength(50)
  celular?: string;

  @ApiProperty({
    required: false,
    type: String,
    maxLength: 150,
    example: 'alterno@example.invalid',
  })
  @ValidateIf((_o: unknown, v: unknown) => v !== undefined)
  @IsString()
  @MaxLength(150)
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim().toLowerCase() : value,
  )
  @IsEmail()
  emailAlterno?: string;

  @ApiProperty({ required: false, type: DomicilioClienteDto })
  @ValidateIf((_o: unknown, v: unknown) => v !== undefined)
  @IsObject()
  @ValidateNested()
  @Type(() => DomicilioClienteDto)
  domicilioFiscal?: DomicilioClienteDto;
}
