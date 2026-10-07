import { BadRequestException } from '@nestjs/common';
import { crearValidationPipe } from '../../../common/http/validation.js';
import { CreateClienteDto } from './create-cliente.dto.js';
import { UpdateClienteDto } from './update-cliente.dto.js';
import { CreateProductoDto } from '../../productos/dto/create-producto.dto.js';
import { UpdateProductoDto } from '../../productos/dto/update-producto.dto.js';
import {
  CreateUnidadMedidaDto,
  UpdateUnidadMedidaDto,
} from '../../unidades-medida/dto/unidad-medida.dto.js';
const pipe = crearValidationPipe();
const validar = (
  body: object,
  metatype:
    | typeof CreateClienteDto
    | typeof UpdateClienteDto
    | typeof CreateProductoDto
    | typeof UpdateProductoDto
    | typeof CreateUnidadMedidaDto
    | typeof UpdateUnidadMedidaDto,
) => pipe.transform(body, { type: 'body', metatype });
describe('Backend 5A: validación de metadata', () => {
  it('conserva cliente legacy y acepta códigos fiscales históricos sin catálogo SAT', async () => {
    await expect(
      validar({ nombre: 'Persona', apellido: 'Ejemplo' }, CreateClienteDto),
    ).resolves.toMatchObject({ nombre: 'Persona' });
    await expect(
      validar(
        {
          nombre: 'Persona',
          rfc: ' historico ',
          regimenFiscal: '601',
          usoCfdi: 'G03',
        },
        CreateClienteDto,
      ),
    ).resolves.toMatchObject({ rfc: 'HISTORICO' });
  });
  it.each([CreateClienteDto, UpdateClienteDto])(
    'valida domicilio anidado y normaliza emails %s',
    async (metatype) => {
      await expect(
        validar(
          {
            nombre: 'Persona',
            emailAlterno: ' ALT@EXAMPLE.INVALID ',
            domicilioFiscal: { codigoPostal: '00123' },
          },
          metatype,
        ),
      ).resolves.toMatchObject({
        emailAlterno: 'alt@example.invalid',
        domicilioFiscal: { codigoPostal: '00123' },
      });
      await expect(
        validar(
          { nombre: 'Persona', domicilioFiscal: { envio: true } },
          metatype,
        ),
      ).rejects.toThrow(BadRequestException);
    },
  );
  it.each([
    { domicilioFiscal: null },
    { domicilioFiscal: 'texto' },
    { domicilioFiscal: { pais: null } },
    { emailAlterno: 'invalido' },
    { regimenFiscal: 601 },
  ])('rechaza metadata de cliente inválida %j', async (campos) => {
    await expect(
      validar({ nombre: 'Persona', ...campos }, CreateClienteDto),
    ).rejects.toThrow(BadRequestException);
  });
  it.each([CreateProductoDto, UpdateProductoDto])(
    'separa SKU de clave SAT y permite códigos alfanuméricos %s',
    async (metatype) => {
      await expect(
        validar(
          {
            sku: 'HEGA1805',
            nombre: 'Ejemplo',
            costo: 100,
            precio: 160,
            stockMinimo: 0,
            categoriaId: 1,
            claveProductoServicioSat: 'SAT-ALFA',
            objetoImpuestoSat: '2',
            unidadMedidaId: 1,
          },
          metatype,
        ),
      ).resolves.toMatchObject({
        sku: 'HEGA1805',
        claveProductoServicioSat: 'SAT-ALFA',
      });
    },
  );
  it.each([
    { unidadMedidaId: 0 },
    { unidadMedidaId: null },
    { unidadMedidaId: '1' },
    { objetoImpuestoSat: 2 },
    { claveProductoServicioSat: 'X'.repeat(51) },
  ])('rechaza metadata de producto inválida %j', async (campos) => {
    await expect(validar(campos, UpdateProductoDto)).rejects.toThrow(
      BadRequestException,
    );
  });
  it('normaliza clave y permite PATCH parcial de unidades', async () => {
    await expect(
      validar({ clave: ' xbx ', nombre: 'CAJA' }, CreateUnidadMedidaDto),
    ).resolves.toMatchObject({ clave: 'XBX' });
    await expect(
      validar({ nombre: 'PAQUETE' }, UpdateUnidadMedidaDto),
    ).resolves.toMatchObject({ nombre: 'PAQUETE' });
  });
  it.each([{ clave: '   ' }, { nombre: null }, { activo: false }])(
    'rechaza unidad inválida %j',
    async (campos) => {
      await expect(validar(campos, UpdateUnidadMedidaDto)).rejects.toThrow(
        BadRequestException,
      );
    },
  );
});
