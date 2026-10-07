import { ApiResponse } from '@nestjs/swagger';
import { ApiModulo } from './common/http/api-docs.decorator.js';
import { Controller, Get } from '@nestjs/common';
import { AppService } from './app.service.js';

@ApiModulo('Health', false)
@Controller()
export class AppController {
  constructor(private readonly appService: AppService) {}

  @ApiResponse({ status: 200, schema: { type: 'string', example: 'Hello World!' } })
  @Get()
  getHello(): string {
    return this.appService.getHello();
  }
}
