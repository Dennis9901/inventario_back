import { ImportacionesModule } from './modules/importaciones/importaciones.module.js';
import { ListasPreciosModule } from './modules/listas-precios/listas-precios.module.js';
import { UnidadesMedidaModule } from './modules/unidades-medida/unidades-medida.module.js';
import { APP_FILTER, APP_INTERCEPTOR, APP_PIPE } from '@nestjs/core';
import type { MiddlewareConsumer, NestModule } from '@nestjs/common';
import { RequestMethod } from '@nestjs/common';
import { ConfiguracionModule } from './configuracion/configuracion.module.js';
import { AuditoriaModule } from './modules/auditoria/auditoria.module.js';
import { HealthModule } from './modules/health/health.module.js';
import { HttpModule } from './common/http/http.module.js';
import { RequestContextMiddleware } from './common/http/request-context.middleware.js';
import { GlobalExceptionFilter } from './common/http/global-exception.filter.js';
import { AuditoriaInterceptor } from './common/http/auditoria.interceptor.js';
import { crearValidationPipe } from './common/http/validation.js';
import { DashboardModule } from './modules/dashboard/dashboard.module.js';
import { ReportesModule } from './modules/reportes/reportes.module.js';
import { DevolucionesModule } from './modules/devoluciones/devoluciones.module.js';
import { ClientesModule } from './modules/clientes/clientes.module.js';
import { VentasModule } from './modules/ventas/ventas.module.js';
import { ProveedoresModule } from './modules/proveedores/proveedores.module.js';
import { ComprasModule } from './modules/compras/compras.module.js';
import { Module } from '@nestjs/common';
import { AppController } from './app.controller.js';
import { AppService } from './app.service.js';
import { DatabaseModule } from './database/database.module.js';
import { RolesModule } from './modules/roles/roles.module.js';
import { RolesService } from './modules/roles/roles.service.js';
import { UsuariosModule } from './modules/usuarios/usuarios.module.js';
import { AuthModule } from './modules/auth/auth.module.js';
import { CategoriasModule } from './modules/categorias/categorias.module.js';
import { InventarioModule } from './modules/inventario/inventario.module.js';
import { ProductosModule } from './modules/productos/productos.module.js';

@Module({
  imports: [
    ConfiguracionModule,
    HttpModule,
    DatabaseModule,
    AuditoriaModule,
    HealthModule,
    RolesModule,
    UsuariosModule,
    AuthModule,
    CategoriasModule,
    ProductosModule,
    UnidadesMedidaModule,
    ListasPreciosModule,
    ImportacionesModule,
    InventarioModule,
    ProveedoresModule,
    ComprasModule,
    ClientesModule,
    VentasModule,
    DevolucionesModule,
    DashboardModule,
    ReportesModule,
  ],
  controllers: [AppController],
  providers: [
    AppService,
    RolesService,
    { provide: APP_FILTER, useClass: GlobalExceptionFilter },
    { provide: APP_INTERCEPTOR, useClass: AuditoriaInterceptor },
    { provide: APP_PIPE, useFactory: crearValidationPipe },
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer
      .apply(RequestContextMiddleware)
      .forRoutes({ path: '{*path}', method: RequestMethod.ALL });
  }
}
