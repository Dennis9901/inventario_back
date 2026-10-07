import { Module } from '@nestjs/common';
import { AuditoriaService } from './auditoria.service.js';
import { AuditoriaController } from './auditoria.controller.js';
@Module({ controllers: [AuditoriaController], providers: [AuditoriaService] })
export class AuditoriaModule {}
