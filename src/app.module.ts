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
    DatabaseModule,
    RolesModule,
    UsuariosModule,
    AuthModule,
    CategoriasModule,
    ProductosModule,
    InventarioModule,
    ProveedoresModule,
    ComprasModule,
    ClientesModule,
    VentasModule,
  ],
  controllers: [AppController],
  providers: [AppService, RolesService],
})
export class AppModule {}
