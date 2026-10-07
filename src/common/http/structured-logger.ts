import { Injectable, Logger } from '@nestjs/common';

export function textoSeguro(value: string) {
  let texto = value;
  for (const clave of ['JWT_SECRET', 'DATABASE_URL']) {
    const secreto = process.env[clave];
    if (secreto) texto = texto.split(secreto).join('[REDACTED]');
  }
  try {
    const password = decodeURIComponent(
      new URL(process.env.DATABASE_URL ?? '').password,
    );
    if (password) texto = texto.split(password).join('[REDACTED]');
  } catch {
    /* Config inválida se valida al arranque; nunca se imprime. */
  }
  // Redactar valores, incluso cuando aparecen incrustados en mensajes/stack de terceros.
  return texto
    .replace(/postgres(?:ql)?:\/\/[^\s"'<>]+/gi, '[REDACTED]')
    .replace(/\bBearer\s+[^\s"',;]+/gi, '[REDACTED]')
    .replace(
      /\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/g,
      '[REDACTED]',
    )
    .replace(/\$argon2[^\s"']+/g, '[REDACTED]')
    .replace(
      /\b(?:password|authorization|access_token|refresh_token|cookie|JWT_SECRET|DATABASE_URL)["']?\s*[=:]\s*(?:"[^"]*"|'[^']*'|[^\s,;]+)/gi,
      '[REDACTED]',
    )
    .split('')
    .map((c) => (c.charCodeAt(0) < 32 || c.charCodeAt(0) === 127 ? ' ' : c))
    .join('')
    .slice(0, 12000);
}
@Injectable()
export class StructuredLogger {
  private readonly logger = new Logger('API');
  write(
    evento: Record<string, string | number | boolean | undefined>,
    error = false,
  ) {
    const seguro = Object.fromEntries(
      Object.entries(evento)
        .filter(
          ([k]) =>
            !/password|authorization|token|cookie|secret|database_url/i.test(k),
        )
        .map(([k, v]) => [k, typeof v === 'string' ? textoSeguro(v) : v]),
    );
    const linea = JSON.stringify(seguro);
    if (error) this.logger.error(linea);
    else this.logger.log(linea);
  }
}
