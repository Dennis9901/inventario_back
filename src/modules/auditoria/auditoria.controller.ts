import {
  ApiModulo,
  ApiResultado,
} from '../../common/http/api-docs.decorator.js';
import {
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Query,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { RolesGuard } from '../auth/guards/roles.guard.js';
import { Roles } from '../auth/decorators/roles.decorator.js';
import { AuditoriaService } from './auditoria.service.js';
import { AuditoriaQueryDto } from './dto/auditoria-query.dto.js';

@ApiModulo('Auditoria', true)
@Controller('auditoria')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('ADMINISTRADOR')
export class AuditoriaController {
  constructor(private readonly service: AuditoriaService) {}
  @ApiResultado('Auditoria', 200, 'paginado', 'Auditoria: findAll')
  @Get()
  findAll(@Query() query: AuditoriaQueryDto) {
    return this.service.findAll(query);
  }
  @ApiResultado('Auditoria', 200, 'objeto', 'Auditoria: findOne')
  @Get(':id')
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.service.findOne(id);
  }
}
