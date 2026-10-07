import { applyDecorators } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { schemaRespuesta } from './openapi.schemas.js';

export function ApiModulo(tag: string, protegido = true) {
  return applyDecorators(
    ApiTags(tag),
    ...(protegido ? [ApiBearerAuth()] : []),
    ...[400, 404, 409, 500, ...(protegido ? [401, 403] : [])].map((status) =>
      ApiResponse({
        status,
        description: `Error HTTP ${status}; contrato correlacionado`,
        schema: {
          $ref: `#/components/schemas/${status === 400 ? 'ValidationErrorResponse' : 'ApiErrorResponse'}`,
        },
      }),
    ),
  );
}
export function ApiResultado(
  nombre: string,
  status = 200,
  formato: 'objeto' | 'array' | 'data' | 'paginado' = 'objeto',
  summary?: string,
) {
  return applyDecorators(
    ApiOperation({ summary: summary ?? nombre }),
    ApiResponse({
      status,
      schema: schemaRespuesta(nombre, formato),
      headers: {
        'X-Request-Id': {
          description: 'Identificador de correlación UUID',
          schema: { type: 'string', format: 'uuid' },
        },
      },
    }),
  );
}
