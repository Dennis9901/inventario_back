export type TipoImportacion = 'CLIENTES' | 'PRODUCTOS' | 'PRECIOS';
export type EstadoFila = 'VALIDA' | 'ADVERTENCIA' | 'ERROR';
export type ImportAction =
  'CREAR' | 'ACTUALIZAR' | 'SIN_CAMBIOS' | 'CERRAR_Y_CREAR' | 'CONFLICTO';
export interface ImportIssue {
  fila: number;
  campo: string;
  codigo: string;
  mensaje: string;
}
export interface RawRow {
  numeroFila: number;
  valores: Record<string, string>;
  advertencias: ImportIssue[];
}
export interface ParsedFile {
  encabezados: string[];
  filas: RawRow[];
  hojas: string[];
  hoja: string | null;
}
export interface NormalizedRow {
  numeroFila: number;
  tipo: TipoImportacion;
  clave: string;
  datos: Record<string, string>;
  errores: ImportIssue[];
  advertencias: ImportIssue[];
}
export interface Difference {
  campo: string;
  anterior: string | null;
  nuevo: string;
}
export interface PriceAction {
  codigo: string;
  precio: string;
  accion: ImportAction;
  anteriorId: number | null;
}
export interface ImportPlan {
  accion: ImportAction;
  existenteId: number | null;
  fingerprint: string;
  cambios: Difference[];
  precios: PriceAction[];
}
export interface ValidatedRow extends NormalizedRow {
  estado: EstadoFila;
  plan: ImportPlan;
}
export interface UploadedImportFile {
  originalname: string;
  mimetype: string;
  buffer: Buffer;
  size: number;
}
