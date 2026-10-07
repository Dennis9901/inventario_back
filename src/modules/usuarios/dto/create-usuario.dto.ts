import { ApiProperty } from '@nestjs/swagger';
import {
  IsEmail,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';

export class CreateUsuarioDto {
  @ApiProperty({
    required: true,
    type: String,
    example: 'Dato ficticio',
    maxLength: 100,
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  nombre!: string;

  @ApiProperty({
    required: false,
    type: String,
    example: 'Texto de ejemplo',
    maxLength: 100,
  })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  apellido?: string;

  @ApiProperty({
    required: true,
    type: String,
    format: 'email',
    example: 'persona@example.invalid',
    maxLength: 150,
  })
  @IsEmail()
  @MaxLength(150)
  email!: string;

  @ApiProperty({
    required: true,
    type: String,
    format: 'password',
    writeOnly: true,
    minLength: 8,
    maxLength: 100,
  })
  @IsString()
  @MinLength(8)
  @MaxLength(100)
  password!: string;

  @ApiProperty({ required: true, type: Number, format: 'int32', example: 1 })
  @IsInt()
  rolId!: number;
}
