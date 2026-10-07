import { BadRequestException } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { PreviewImportacionDto } from './dto/importaciones.dto.js';
import { centavos, importe } from '../../common/dinero.js';
export const hash = (value: string | Buffer) =>
  createHash('sha256').update(value).digest('hex');
export function errorArchivo(codigo: string, mensaje: string): never {
  throw new BadRequestException({ code: codigo, message: mensaje });
}
export function encabezado(s: string) {
  return s
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '');
}
export function columnaFiscal(value: string): boolean {
  const name = value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, ' ');
  return (
    /\b(?:IVA|TOTAL)\b/.test(name) ||
    /^PRECIO(?:PUBLICO|CLINICA|DISTRIBUIDOR)(?:MAS|CON)?IVA$/.test(
      encabezado(value),
    )
  );
}
export function decimalArchivo(value: string) {
  let s = value.trim().replace(/^\$\s*/, '');
  if (/^\d{1,3}(?:,\d{3})+\.\d{1,2}$/.test(s)) s = s.replaceAll(',', '');
  else if (/^\d+,\d{1,2}$/.test(s)) s = s.replace(',', '.');
  if (!/^\d+(?:\.\d{1,2})?$/.test(s))
    throw new Error('Importe ambiguo o inválido');
  const c = centavos(s);
  if (c > 100000000000000n) throw new Error('Importe fuera de rango');
  return importe(c);
}
export async function opcionesPreview(
  value?: string,
): Promise<PreviewImportacionDto> {
  let raw: unknown = {};
  try {
    raw = value ? JSON.parse(value) : {};
  } catch {
    errorArchivo('IMPORT_OPCIONES_INVALIDAS', 'opciones debe ser JSON válido');
  }
  if (!raw || typeof raw !== 'object' || Array.isArray(raw))
    errorArchivo('IMPORT_OPCIONES_INVALIDAS', 'opciones debe ser un objeto');
  const dto = plainToInstance(PreviewImportacionDto, raw);
  const errores = await validate(dto, {
    whitelist: true,
    forbidNonWhitelisted: true,
    validationError: { target: false, value: false },
  });
  if (errores.length)
    errorArchivo(
      'IMPORT_OPCIONES_INVALIDAS',
      'Opciones inválidas; revisa tipos y campos documentados',
    );
  if (dto.vigenciaDesde)
    dto.vigenciaDesde = new Date(dto.vigenciaDesde).toISOString();
  if (dto.vigenciaHasta)
    dto.vigenciaHasta = new Date(dto.vigenciaHasta).toISOString();
  if (
    dto.vigenciaHasta &&
    dto.vigenciaDesde &&
    dto.vigenciaHasta <= dto.vigenciaDesde
  )
    errorArchivo(
      'IMPORT_VIGENCIA_INVALIDA',
      'El fin debe ser posterior al inicio',
    );
  return dto;
}
export function objeto(value: unknown): Record<string, unknown> {
  if (value && typeof value === 'object' && !Array.isArray(value))
    return value as Record<string, unknown>;
  return {};
}
export function lista(value: unknown): unknown[] {
  return value === undefined ? [] : Array.isArray(value) ? value : [value];
}
export function texto(value: unknown): string {
  return typeof value === 'string'
    ? value
    : typeof value === 'number'
      ? String(value)
      : '';
}
