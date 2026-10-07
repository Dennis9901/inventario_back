import { randomUUID } from 'node:crypto';
import {
  BadRequestException,
  ConflictException,
  HttpException,
  Logger,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import type { ArgumentsHost } from '@nestjs/common';
import { cargarConfiguracion } from '../../configuracion/configuracion.js';
import { idSeguro } from './request-context.middleware.js';
import { StructuredLogger, textoSeguro } from './structured-logger.js';
import { camposInvalidos, crearValidationPipe } from './validation.js';
import { GlobalExceptionFilter } from './global-exception.filter.js';
import { datosAuditoria } from './audit-data.js';
import { requestContext } from './request-context.js';
import { DatabaseService } from '../../database/database.service.js';
import { HealthService } from '../../modules/health/health.service.js';

const env: NodeJS.ProcessEnv = {
  DATABASE_URL: 'postgresql://ejemplo@localhost/inventario_ficticio',
  JWT_SECRET: 'secreto-ficticio-para-unitarias-123456',
  NODE_ENV: 'test',
};
afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
});
describe('Configuración validada', () => {
  it('defaults y versión sin exponer secretos', () =>
    expect(cargarConfiguracion(env)).toMatchObject({
      port: 3000,
      jwtExpiresIn: '8h',
      jwtExpiresSeconds: 28800,
      corsOrigins: ['http://localhost:4200'],
      version: '0.0.1',
    }));
  it('lista CORS explícita y duración utilizada', () =>
    expect(
      cargarConfiguracion({
        ...env,
        CORS_ORIGINS: 'http://localhost:4200,https://ejemplo.invalid',
        JWT_EXPIRES_IN: '15m',
      }),
    ).toMatchObject({
      corsOrigins: ['http://localhost:4200', 'https://ejemplo.invalid'],
      jwtExpiresSeconds: 900,
    }));
  it.each(['JWT_SECRET', 'DATABASE_URL'])('falla rápido sin %s', (campo) => {
    const missing = { ...env };
    delete missing[campo];
    expect(() => cargarConfiguracion(missing)).toThrow(
      /Configuración inválida/,
    );
  });
  it.each([
    { PORT: '0' },
    { PORT: '65536' },
    { PORT: 'abc' },
    { JWT_EXPIRES_IN: '0h' },
    { JWT_EXPIRES_IN: 'para siempre' },
    { JWT_EXPIRES_IN: '999999999999d' },
    { DATABASE_URL: 'mysql://usuario@localhost/db' },
    { CORS_ORIGINS: '*' },
    { CORS_ORIGINS: 'https://ejemplo.invalid/path' },
    { NODE_ENV: 'otro' },
  ])('rechaza configuración inválida', (q) =>
    expect(() => cargarConfiguracion({ ...env, ...q })).toThrow(),
  );
  it('producción exige secreto fuerte y orígenes explícitos', () => {
    expect(() =>
      cargarConfiguracion({ ...env, NODE_ENV: 'production' }),
    ).toThrow(/CORS_ORIGINS/);
    expect(() =>
      cargarConfiguracion({
        ...env,
        NODE_ENV: 'production',
        JWT_SECRET: 'corto',
        CORS_ORIGINS: 'https://ejemplo.invalid',
      }),
    ).toThrow(/JWT_SECRET/);
  });
  it('mensaje de configuración no contiene el valor privado', () => {
    try {
      cargarConfiguracion({
        ...env,
        DATABASE_URL: 'mysql://dato-privado-no-imprimir@local/db',
      });
    } catch (error: unknown) {
      expect(String(error)).not.toContain('dato-privado-no-imprimir');
    }
  });
});
describe('Correlación y sanitización', () => {
  it('reutiliza UUID válido en minúsculas', () => {
    const id = randomUUID();
    expect(idSeguro(id.toUpperCase())).toBe(id);
  });
  it.each([
    undefined,
    '',
    '<script>',
    'a'.repeat(5000),
    ['a', 'b'],
    '6b30bbed-2289-4f18-a5d5-9473248b4a46\n',
  ])('genera UUID para input no confiable', (value) =>
    expect(idSeguro(value)).toMatch(/^[\da-f-]{36}$/),
  );
  it('omite query/body/headers y redacta secretos embebidos', () => {
    const texto = textoSeguro(
      'diagnóstico password=privado Authorization: Bearer tokenficticio cookie=sesion {"password":"valor-json"} postgresql://u:clave@local/db $argon2id$no-mostrar',
    );
    expect(texto).not.toMatch(
      /privado|tokenficticio|sesion|valor-json|postgresql:\/\/|argon2id/,
    );
    expect(texto).toContain('diagnóstico');
  });
  it('redacta JWT de estructura válida y controles', () =>
    expect(
      textoSeguro('eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOjF9.firma\n\rdiagnóstico'),
    ).toBe('[REDACTED]  diagnóstico'));
  it('logger entrega JSON sanitizado sin llaves sensibles', () => {
    const spy = vi
      .spyOn(Logger.prototype, 'log')
      .mockImplementation(() => undefined);
    new StructuredLogger().write({
      type: 'http_request',
      password: 'no-mostrar',
      Authorization: 'secreto',
      method: 'GET',
      statusCode: 200,
      requestId: 'id',
      durationMs: 0,
    });
    const log = JSON.parse(spy.mock.calls[0]![0] as string) as Record<
      string,
      unknown
    >;
    expect(log).toMatchObject({
      method: 'GET',
      statusCode: 200,
      durationMs: 0,
    });
    expect(log).not.toHaveProperty('password');
    expect(log).not.toHaveProperty('Authorization');
  });
});
describe('Validación por campo', () => {
  it('aplana errores nested sin target ni value', () =>
    expect(
      camposInvalidos([
        {
          property: 'detalles',
          children: [
            {
              property: '0',
              children: [
                {
                  property: 'productoId',
                  constraints: { isInt: 'productoId must be integer' },
                },
              ],
            },
          ],
        },
      ]),
    ).toEqual([
      {
        field: 'detalles.0.productoId',
        messages: ['productoId must be integer'],
      },
    ]));
  it('pipe conserva whitelist/forbid/transform y produce código estable', async () => {
    class Dto {}
    await expect(
      crearValidationPipe().transform(
        { extra: 1 },
        { type: 'body', metatype: Dto },
      ),
    ).rejects.toMatchObject({
      response: {
        code: 'VALIDATION_ERROR',
        errors: [{ field: 'extra', messages: expect.any(Array) }],
      },
    });
  });
});
describe('ExceptionFilter global', () => {
  function filtrar(error: unknown) {
    const response = {
      headersSent: false,
      setHeader: vi.fn(),
      status: vi.fn(),
      json: vi.fn(),
    };
    response.status.mockReturnValue(response);
    const request = {
      requestId: randomUUID(),
      method: 'POST',
      path: '/api/v1/ejemplo',
      user: { sub: 7 },
    };
    const host = {
      switchToHttp: () => ({
        getRequest: () => request,
        getResponse: () => response,
      }),
    } as unknown as ArgumentsHost;
    const logger = new StructuredLogger();
    const log = vi.spyOn(logger, 'write').mockImplementation(() => undefined);
    new GlobalExceptionFilter(logger).catch(error, host);
    return {
      body: response.json.mock.calls[0]![0] as Record<string, unknown>,
      response,
      request,
      log,
    };
  }
  it.each([
    [new BadRequestException('Regla inválida'), 400, 'BAD_REQUEST'],
    [new UnauthorizedException('Token inválido'), 401, 'UNAUTHORIZED'],
    [new NotFoundException('No existe'), 404, 'NOT_FOUND'],
    [new ConflictException('Duplicado'), 409, 'CONFLICT'],
    [
      new ConflictException('Existencia insuficiente para realizar la salida'),
      409,
      'STOCK_INSUFICIENTE',
    ],
  ] as const)('preserva HTTP y códigos', (error, status, code) => {
    const { body, request } = filtrar(error);
    expect(body).toMatchObject({
      statusCode: status,
      code,
      requestId: request.requestId,
      errors: [],
    });
  });
  it('validación structured es estable', () =>
    expect(
      filtrar(
        new BadRequestException({
          code: 'VALIDATION_ERROR',
          message: 'Error de validación',
          errors: [{ field: 'email', messages: ['inválido'] }],
        }),
      ).body,
    ).toMatchObject({
      code: 'VALIDATION_ERROR',
      errors: [{ field: 'email', messages: ['inválido'] }],
    }));
  it('500 inesperado nunca expone mensaje interno o stack', () => {
    const { body, log } = filtrar(new Error('SQL interno-no-publicar'));
    expect(body).toMatchObject({
      statusCode: 500,
      code: 'INTERNAL_ERROR',
      message: 'Error interno del servidor',
    });
    expect(JSON.stringify(body)).not.toMatch(/SQL|stack/);
    expect(log).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'http_error',
        userId: 7,
        stack: expect.any(String),
      }),
      true,
    );
  });
  it('HttpException500 tampoco expone detalles', () =>
    expect(filtrar(new HttpException('SQL privado', 500)).body.message).toBe(
      'Error interno del servidor',
    ));
});
describe('Auditoría controlada', () => {
  const contexto = {
    requestId: randomUUID(),
    method: 'POST',
    path: '/api/v1/ventas',
    usuarioId: 7,
    auditoria: { accion: 'VENTA_CONFIRMADA', entidad: 'VENTA' },
  };
  it('metadata whitelist sin body/usuario completo/credenciales', () => {
    const r = datosAuditoria(contexto, {
      id: 2,
      folio: 'VENT-2026-EJEMPLO',
      estado: 'CONFIRMADA',
      password: 'no-guardar',
      access_token: 'no-guardar',
      usuario: { password: 'no-guardar' },
    });
    expect(r).toMatchObject({
      usuarioId: 7,
      entidadId: 2,
      metadata: '{"folio":"VENT-2026-EJEMPLO","estadoNuevo":"CONFIRMADA"}',
    });
    expect(JSON.stringify(r)).not.toMatch(/password|access_token|no-guardar/);
    expect(datosAuditoria(contexto, {}).entidadId).toBeNull();
  });
  it('login toma id del resultado básico', () =>
    expect(
      datosAuditoria(
        {
          ...contexto,
          usuarioId: undefined,
          auditoria: { accion: 'LOGIN_EXITOSO', entidad: 'USUARIO' },
        },
        { usuario: { id: 3 }, access_token: 'no-guardar' },
      ),
    ).toMatchObject({ usuarioId: 3, entidadId: 3 }));
  it('ruta id tiene prioridad y soporta respuesta array', () =>
    expect(
      datosAuditoria({ ...contexto, entidadId: 9 }, [{ id: 2 }]).entidadId,
    ).toBe(9));
  it('no auditoría en transacción sin contexto HTTP', async () => {
    const database = new DatabaseService();
    const insert = vi.fn();
    const tx = { orm: { public: { Auditoria: { create: insert } } } };
    vi.spyOn(database.db, 'transaction').mockImplementation(async (callback) =>
      callback(tx as unknown as Parameters<typeof callback>[0]),
    );
    expect(await database.transaction(async () => 42)).toBe(42);
    expect(insert).not.toHaveBeenCalled();
  });
  it('audit insert ocurre después de callback y exactamente una vez', async () => {
    const database = new DatabaseService();
    const insert = vi.fn().mockResolvedValue({});
    const tx = { orm: { public: { Auditoria: { create: insert } } } };
    vi.spyOn(database.db, 'transaction').mockImplementation(async (callback) =>
      callback(tx as unknown as Parameters<typeof callback>[0]),
    );
    const c = { ...contexto, auditoriaPersistida: false };
    await requestContext.run(c, () =>
      database.transaction(async () => ({ id: 2 })),
    );
    expect(insert).toHaveBeenCalledTimes(1);
    expect(c.auditoriaPersistida).toBe(true);
  });
  it('callback fallido nunca llega al INSERT de auditoría', async () => {
    const database = new DatabaseService();
    const insert = vi.fn();
    const tx = { orm: { public: { Auditoria: { create: insert } } } };
    vi.spyOn(database.db, 'transaction').mockImplementation(async (callback) =>
      callback(tx as unknown as Parameters<typeof callback>[0]),
    );
    await expect(
      requestContext.run({ ...contexto }, () =>
        database.transaction(async () => {
          throw new Error('falló operación');
        }),
      ),
    ).rejects.toThrow('falló operación');
    expect(insert).not.toHaveBeenCalled();
  });
});
describe('Readiness acotada', () => {
  it('timeout produce no-ready y diagnóstico seguro', async () => {
    vi.useFakeTimers();
    const logger = new StructuredLogger();
    vi.spyOn(logger, 'write').mockImplementation(() => undefined);
    const service = new HealthService(new DatabaseService(), logger);
    vi.spyOn(service, 'ping').mockImplementation(
      () => new Promise(() => undefined),
    );
    const ready = service.ready();
    await vi.advanceTimersByTimeAsync(2000);
    expect(await ready).toBe(false);
  });
});
