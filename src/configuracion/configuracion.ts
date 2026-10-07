import 'dotenv/config';
import packageJson from '../../package.json' with { type: 'json' };

export function cargarConfiguracion(env: NodeJS.ProcessEnv = process.env) {
  const fail = (campo: string): never => {
    throw new Error(`Configuración inválida: ${campo}`);
  };
  const nodeEnv = env.NODE_ENV ?? 'development';
  if (!['development', 'test', 'production'].includes(nodeEnv))
    fail('NODE_ENV');
  const jwtSecret = env.JWT_SECRET;
  if (!jwtSecret?.trim() || (nodeEnv === 'production' && jwtSecret.length < 32))
    fail('JWT_SECRET (requerido; mínimo 32 caracteres en producción)');
  const databaseUrl = env.DATABASE_URL;
  try {
    const url = new URL(databaseUrl ?? '');
    if (
      !['postgres:', 'postgresql:'].includes(url.protocol) ||
      !url.hostname ||
      !url.pathname.slice(1)
    )
      fail('DATABASE_URL');
  } catch {
    fail('DATABASE_URL (PostgreSQL requerido)');
  }
  const port = Number(env.PORT ?? '3000');
  if (!Number.isInteger(port) || port < 1 || port > 65535) fail('PORT');
  const jwtExpiresIn = env.JWT_EXPIRES_IN ?? '8h';
  const match = /^(\d+)(s|m|h|d)$/.exec(jwtExpiresIn);
  if (!match) fail('JWT_EXPIRES_IN (ejemplo: 8h)');
  const jwtExpiresSeconds =
    Number(match![1]) * ({ s: 1, m: 60, h: 3600, d: 86400 }[match![2]] ?? 0);
  if (
    !Number.isSafeInteger(jwtExpiresSeconds) ||
    jwtExpiresSeconds < 1 ||
    jwtExpiresSeconds > 31536000
  )
    fail('JWT_EXPIRES_IN');
  if (nodeEnv === 'production' && !env.CORS_ORIGINS?.trim())
    fail('CORS_ORIGINS (requerido en producción)');
  const corsOrigins = (env.CORS_ORIGINS ?? 'http://localhost:4200')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  for (const origin of corsOrigins) {
    try {
      const url = new URL(origin);
      if (
        !['http:', 'https:'].includes(url.protocol) ||
        url.origin !== origin ||
        url.username ||
        url.password
      )
        fail('CORS_ORIGINS');
    } catch {
      fail('CORS_ORIGINS (orígenes HTTP exactos separados por comas)');
    }
  }
  return {
    nodeEnv,
    jwtSecret: jwtSecret!,
    databaseUrl: databaseUrl!,
    port,
    jwtExpiresIn,
    jwtExpiresSeconds,
    corsOrigins,
    version: packageJson.version,
  };
}
