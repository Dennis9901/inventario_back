import {
  ConfiguracionModule,
  ConfiguracionService,
} from '../../configuracion/configuracion.module.js';
import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';

import { AuthController } from './auth.controller.js';
import { AuthService } from './auth.service.js';
import { JwtAuthGuard } from './guards/jwt-auth.guard.js';
import { RolesGuard } from './guards/roles.guard.js';

@Module({
  imports: [
    JwtModule.registerAsync({
      global: true,
      imports: [ConfiguracionModule],
      inject: [ConfiguracionService],
      useFactory: (config: ConfiguracionService) => ({
        secret: config.valores.jwtSecret,
        signOptions: { expiresIn: config.valores.jwtExpiresSeconds },
      }),
    }),
  ],
  controllers: [AuthController],
  providers: [AuthService, JwtAuthGuard, RolesGuard],
  exports: [JwtAuthGuard, RolesGuard],
})
export class AuthModule {}
