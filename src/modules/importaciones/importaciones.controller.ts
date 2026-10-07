import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Post,
  Query,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBody, ApiConsumes, ApiExtraModels } from '@nestjs/swagger';
import {
  ApiModulo,
  ApiResultado,
} from '../../common/http/api-docs.decorator.js';
import { Auditar } from '../../common/http/auditar.decorator.js';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { RolesGuard } from '../auth/guards/roles.guard.js';
import { Roles } from '../auth/decorators/roles.decorator.js';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import type { JwtPayload } from '../auth/interfaces/jwt-payload.interface.js';
import { ImportacionesService } from './importaciones.service.js';
import {
  ConfirmarImportacionDto,
  ImportacionQueryDto,
  ImportacionFilaQueryDto,
  UploadPreviewDto,
  PreviewImportacionDto,
  ColumnaPrecioDto,
  IdentidadPrecioDto,
} from './dto/importaciones.dto.js';
import type { UploadedImportFile } from './importaciones.types.js';
import { limitesImportacion } from './importaciones.config.js';
const limit = limitesImportacion();
const upload = () =>
  FileInterceptor('archivo', {
    limits: {
      fileSize: limit.maxBytes,
      files: 1,
      fields: 1,
      fieldSize: 200000,
      parts: 2,
    },
  });
const uploadSchema = {
  type: 'object' as const,
  required: ['archivo'],
  properties: {
    archivo: { type: 'string' as const, format: 'binary' },
    opciones: {
      type: 'string' as const,
      description:
        'JSON PreviewImportacionDto; ver esquema y documentación. Nunca rutas de servidor.',
    },
  },
};
@ApiModulo('Importaciones', true)
@ApiExtraModels(PreviewImportacionDto, ColumnaPrecioDto, IdentidadPrecioDto)
@Controller('importaciones')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('ADMINISTRADOR')
export class ImportacionesController {
  constructor(private readonly service: ImportacionesService) {}
  @Post('clientes/preview')
  @UseInterceptors(upload())
  @ApiConsumes('multipart/form-data')
  @ApiBody({ schema: uploadSchema })
  @ApiResultado(
    'Importacion',
    201,
    'objeto',
    'Preview CSV clientes; sin escrituras comerciales',
  )
  @Auditar('IMPORTACION_PREVIEW_CREADO', 'IMPORTACION')
  clientes(
    @UploadedFile() f: UploadedImportFile | undefined,
    @Body() dto: UploadPreviewDto,
    @CurrentUser() u: JwtPayload,
  ) {
    return this.service.preview('CLIENTES', f, dto.opciones, u.sub);
  }
  @Post('productos/preview')
  @UseInterceptors(upload())
  @ApiConsumes('multipart/form-data')
  @ApiBody({ schema: uploadSchema })
  @ApiResultado(
    'Importacion',
    201,
    'objeto',
    'Preview CSV productos; categoría/costo y unidades explícitos',
  )
  @Auditar('IMPORTACION_PREVIEW_CREADO', 'IMPORTACION')
  productos(
    @UploadedFile() f: UploadedImportFile | undefined,
    @Body() dto: UploadPreviewDto,
    @CurrentUser() u: JwtPayload,
  ) {
    return this.service.preview('PRODUCTOS', f, dto.opciones, u.sub);
  }
  @Post('precios/preview')
  @UseInterceptors(upload())
  @ApiConsumes('multipart/form-data')
  @ApiBody({ schema: uploadSchema })
  @ApiResultado(
    'Importacion',
    201,
    'objeto',
    'Preview XLSX/CSV precios; hoja, columnas/listas y vigencia explícitas',
  )
  @Auditar('IMPORTACION_PREVIEW_CREADO', 'IMPORTACION')
  precios(
    @UploadedFile() f: UploadedImportFile | undefined,
    @Body() dto: UploadPreviewDto,
    @CurrentUser() u: JwtPayload,
  ) {
    return this.service.preview('PRECIOS', f, dto.opciones, u.sub);
  }
  @Get()
  @ApiResultado('Importacion', 200, 'paginado')
  findAll(@Query() q: ImportacionQueryDto) {
    return this.service.findAll(q);
  }
  @Get(':id')
  @ApiResultado('Importacion')
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.service.findOne(id);
  }
  @Get(':id/filas')
  @ApiResultado('ImportacionFila', 200, 'paginado')
  filas(
    @Param('id', ParseIntPipe) id: number,
    @Query() q: ImportacionFilaQueryDto,
  ) {
    return this.service.filas(id, q);
  }
  @Post(':id/confirmar')
  @ApiResultado(
    'Importacion',
    201,
    'objeto',
    'Confirma hash y autorizaciones; revalida y aplica batch atómico. Conflictos 409',
  )
  @Auditar('IMPORTACION_COMPLETADA', 'IMPORTACION')
  confirmar(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: ConfirmarImportacionDto,
  ) {
    return this.service.confirmar(id, dto);
  }
  @Post(':id/cancelar')
  @ApiResultado(
    'Importacion',
    201,
    'objeto',
    'Solo PREVIEW; no deshace datos históricos',
  )
  @Auditar('IMPORTACION_CANCELADA', 'IMPORTACION')
  cancelar(@Param('id', ParseIntPipe) id: number) {
    return this.service.cancelar(id);
  }
}
