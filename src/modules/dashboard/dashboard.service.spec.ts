import { DatabaseService } from '../../database/database.service.js';
import { InventarioService } from '../inventario/inventario.service.js';
import { DashboardService } from './dashboard.service.js';

const database = new DatabaseService();
const service = new DashboardService(database, new InventarioService(database));
type Fila = Awaited<ReturnType<DashboardService['metricas']>>[number];
const fila = (
  tipo: string,
  subtotal: string,
  costo = '0.00',
  periodo = '',
): Fila => ({
  tipo,
  subtotal,
  costo,
  periodo,
  cantidad: 1,
  impuestos: '0.00',
  total: subtotal,
});

afterEach(() => vi.restoreAllMocks());
describe('Dashboard: composición comercial y series', () => {
  it('sin datos conserva objetos y KPIs cero', async () => {
    vi.spyOn(service, 'metricas').mockResolvedValue([]);
    const r = await service.comercial({});
    expect(r.ventas).toEqual({
      cantidad: 0,
      cantidadDevoluciones: 0,
      brutas: '0.00',
      devoluciones: '0.00',
      netas: '0.00',
      impuestos: '0.00',
      facturadas: '0.00',
    });
    expect(r.compras.netas).toBe('0.00');
    expect(r.utilidad.margenPorcentaje).toBe('0.00');
  });
  it.each([
    ['brutas', '1000.00'],
    ['devoluciones', '300.00'],
    ['netas', '700.00'],
  ] as const)('ventas.%s exactas', async (campo, esperado) => {
    vi.spyOn(service, 'metricas').mockResolvedValue([
      fila('VENTA', '1000.00', '600.00'),
      fila('DEVOLUCION_VENTA', '300.00', '180.00'),
    ]);
    expect((await service.comercial({})).ventas[campo]).toBe(esperado);
  });
  it.each([
    ['brutaOriginal', '400.00'],
    ['costoVentasOriginal', '600.00'],
    ['costoDevuelto', '180.00'],
    ['costoNeto', '420.00'],
    ['impactoDevoluciones', '120.00'],
    ['brutaAjustada', '280.00'],
    ['margenPorcentaje', '40.00'],
  ] as const)('utilidad.%s exacta', async (campo, esperado) => {
    vi.spyOn(service, 'metricas').mockResolvedValue([
      fila('VENTA', '1000.00', '600.00'),
      fila('DEVOLUCION_VENTA', '300.00', '180.00'),
    ]);
    expect((await service.comercial({})).utilidad[campo]).toBe(esperado);
  });
  it('compras netas y cantidad de devoluciones', async () => {
    vi.spyOn(service, 'metricas').mockResolvedValue([
      fila('COMPRA', '1600.00'),
      fila('DEVOLUCION_COMPRA', '500.00'),
    ]);
    expect((await service.comercial({})).compras).toMatchObject({
      cantidad: 1,
      cantidadDevoluciones: 1,
      brutas: '1600.00',
      devoluciones: '500.00',
      netas: '1100.00',
    });
  });
  it('impuestos y facturación separados del subtotal', async () => {
    vi.spyOn(service, 'metricas').mockResolvedValue([
      {
        ...fila('VENTA', '1000.00', '600.00'),
        impuestos: '160.00',
        total: '1160.00',
      },
    ]);
    const r = await service.comercial({});
    expect(r.ventas).toMatchObject({
      brutas: '1000.00',
      impuestos: '160.00',
      facturadas: '1160.00',
    });
    expect(r.utilidad.brutaOriginal).toBe('400.00');
  });
  it('devoluciones posteriores sin venta del período producen valores con signo', async () => {
    vi.spyOn(service, 'metricas').mockResolvedValue([
      fila('DEVOLUCION_VENTA', '300.00', '180.00'),
    ]);
    const r = await service.comercial({});
    expect(r.ventas.netas).toBe('-300.00');
    expect(r.utilidad.brutaAjustada).toBe('-120.00');
  });
  it('rellena bucket vacío con cero y ordena ASC aun si SQL mock llega desordenado', async () => {
    vi.spyOn(service, 'metricas').mockResolvedValue([
      fila('VENTA', '500.00', '300.00', '2026-10-03'),
      fila('VENTA', '1000.00', '600.00', '2026-10-01'),
    ]);
    const r = await service.ventas({
      fechaInicio: '2026-10-01',
      fechaFin: '2026-10-03',
      agrupacion: 'dia',
    });
    expect(r.data.map((x) => x.periodo)).toEqual([
      '2026-10-01',
      '2026-10-02',
      '2026-10-03',
    ]);
    expect(r.data[1]).toEqual({
      periodo: '2026-10-02',
      ventasBrutas: '0.00',
      devoluciones: '0.00',
      ventasNetas: '0.00',
      costoNeto: '0.00',
      utilidad: '0.00',
    });
  });
  it('rechaza series enormes antes de consultar PostgreSQL', async () => {
    const spy = vi.spyOn(service, 'metricas');
    await expect(
      service.series({
        fechaInicio: '2020-01-01',
        fechaFin: '2026-10-01',
        agrupacion: 'dia',
      }),
    ).rejects.toThrow();
    expect(spy).not.toHaveBeenCalled();
  });
});
