import {
  ApiModulo,
  ApiResultado,
} from '../../common/http/api-docs.decorator.js';
import { Controller, Get, Res } from '@nestjs/common';
import type { Response } from 'express';
import { HealthService } from './health.service.js';
import { ConfiguracionService } from '../../configuracion/configuracion.module.js';

@ApiModulo('Health', false)
@Controller('health')
export class HealthController {
  constructor(
    private readonly service: HealthService,
    private readonly config: ConfiguracionService,
  ) {}
  @ApiResultado('Health', 200, 'objeto', 'Health: health')
  @Get()
  health() {
    return {
      status: 'ok',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      version: this.config.valores.version,
    };
  }
  @ApiResultado('Readiness', 200, 'objeto', 'Health: ready')
  @ApiResultado('Readiness', 503, 'objeto', 'PostgreSQL no disponible')
  @Get('ready')
  async ready(@Res({ passthrough: true }) response: Response) {
    const ready = await this.service.ready();
    if (!ready) response.status(503);
    return {
      status: ready ? 'ready' : 'not_ready',
      database: ready ? 'up' : 'down',
    };
  }
}
