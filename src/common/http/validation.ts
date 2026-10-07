import { BadRequestException, ValidationPipe } from '@nestjs/common';
import type { ValidationError } from 'class-validator';
import type { ValidationFieldError } from './api-error.dto.js';

export function camposInvalidos(
  errors: ValidationError[],
  prefijo = '',
): ValidationFieldError[] {
  return errors.flatMap((e) => {
    const field = prefijo ? `${prefijo}.${e.property}` : e.property;
    const actuales = e.constraints
      ? [{ field, messages: Object.values(e.constraints) }]
      : [];
    return [...actuales, ...camposInvalidos(e.children ?? [], field)];
  });
}
export function crearValidationPipe() {
  return new ValidationPipe({
    whitelist: true,
    forbidNonWhitelisted: true,
    transform: true,
    validationError: { target: false, value: false },
    exceptionFactory: (errors) =>
      new BadRequestException({
        code: 'VALIDATION_ERROR',
        message: 'Error de validación',
        errors: camposInvalidos(errors),
      }),
  });
}
