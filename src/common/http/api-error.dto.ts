import { ApiProperty } from '@nestjs/swagger';

export class ValidationFieldError {
  @ApiProperty({ example: 'email' }) field!: string;
  @ApiProperty({ type: [String], example: ['email must be an email'] })
  messages!: string[];
}
export class ApiErrorResponse {
  @ApiProperty({ example: 409 }) statusCode!: number;
  @ApiProperty({ example: 'CONFLICT' }) code!: string;
  @ApiProperty({ example: 'Conflicto de negocio' }) message!: string;
  @ApiProperty({ example: '/api/v1/ventas/1/confirmar' }) path!: string;
  @ApiProperty({ example: 'POST' }) method!: string;
  @ApiProperty({
    format: 'uuid',
    example: '6b30bbed-2289-4f18-a5d5-9473248b4a46',
  })
  requestId!: string;
  @ApiProperty({ format: 'date-time', example: '2026-10-05T18:00:00.000Z' })
  timestamp!: string;
  @ApiProperty({ type: [ValidationFieldError] })
  errors!: ValidationFieldError[];
}
export class ValidationErrorResponse extends ApiErrorResponse {}
