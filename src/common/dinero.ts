import { BadRequestException } from '@nestjs/common';

// El JSON numérico se limita a dos decimales y 10^12 antes de convertirlo.
// Multiplicaciones y sumas usan BigInt, nunca aritmética binaria de dinero.
export function centavos(value: number | string): bigint {
  if (typeof value === 'number') {
    if (!Number.isFinite(value) || value < 0 || value > 1_000_000_000_000)
      throw new BadRequestException('Importe inválido');
    const text = String(value);
    if (!/^\d+(?:\.\d{1,2})?$/.test(text))
      throw new BadRequestException(
        'Importes requieren como máximo dos decimales',
      );
    value = text;
  }
  if (!/^\d+(?:\.\d{1,2})?$/.test(value))
    throw new BadRequestException('Importe inválido');
  const [entero, decimal = ''] = value.split('.');
  return BigInt(entero!) * 100n + BigInt(decimal.padEnd(2, '0'));
}

export function importe(value: bigint): string {
  return `${value / 100n}.${String(value % 100n).padStart(2, '0')}`;
}

export function calcularTotales(
  detalles: { subtotal: string }[],
  impuestos: number | string,
) {
  const subtotal = detalles.reduce((sum, d) => sum + centavos(d.subtotal), 0n);
  const tax = centavos(impuestos);
  return {
    subtotal: importe(subtotal),
    impuestos: importe(tax),
    total: importe(subtotal + tax),
  };
}

// Utilidad puede ser negativa; importe() conserva su contrato no negativo.
export function importeConSigno(value: bigint): string {
  return value < 0n ? `-${importe(-value)}` : importe(value);
}
