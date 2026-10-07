import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsNotEmpty, IsString } from 'class-validator';

export class LoginDto {
  @ApiProperty({
    required: true,
    type: String,
    format: 'email',
    example: 'persona@example.invalid',
  })
  @IsEmail()
  email!: string;

  @ApiProperty({
    required: true,
    type: String,
    format: 'password',
    writeOnly: true,
  })
  @IsString()
  @IsNotEmpty()
  password!: string;
}
