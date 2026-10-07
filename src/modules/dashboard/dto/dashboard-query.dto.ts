import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsIn,
  IsInt,
  IsISO8601,
  IsOptional,
  Matches,
  Max,
  Min,
} from 'class-validator';

export class DashboardPeriodoQueryDto {
  @ApiProperty({
    required: false,
    type: String,
    example: '2026-10-01',
    description: 'Día UTC o timestamp con zona explícita; ver API.md',
  })
  @IsOptional()
  @IsISO8601({ strict: true })
  @Matches(/^\d{4}-\d{2}-\d{2}(?:T.*(?:Z|[+-]\d{2}:\d{2}))?$/)
  fechaInicio?: string;

  @ApiProperty({
    required: false,
    type: String,
    example: '2026-10-01',
    description: 'Día UTC o timestamp con zona explícita; ver API.md',
  })
  @IsOptional()
  @IsISO8601({ strict: true })
  @Matches(/^\d{4}-\d{2}-\d{2}(?:T.*(?:Z|[+-]\d{2}:\d{2}))?$/)
  fechaFin?: string;
}

export class DashboardSerieQueryDto extends DashboardPeriodoQueryDto {
  @ApiProperty({
    required: false,
    type: String,
    enum: ['dia', 'semana', 'mes'],
    default: 'dia',
  })
  @IsIn(['dia', 'semana', 'mes'])
  agrupacion: 'dia' | 'semana' | 'mes' = 'dia';
}

export class DashboardLimitQueryDto {
  @ApiProperty({
    required: false,
    type: 'integer',
    format: 'int32',
    example: 1,
    minimum: 1,
    maximum: 50,
    default: 10,
  })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  limit = 10;
}

export class DashboardRankingQueryDto extends DashboardPeriodoQueryDto {
  @ApiProperty({
    required: false,
    type: 'integer',
    format: 'int32',
    example: 1,
    minimum: 1,
    maximum: 50,
    default: 10,
  })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  limit = 10;
}

export class DashboardStockQueryDto {
  @ApiProperty({
    required: false,
    type: 'integer',
    format: 'int32',
    example: 1,
    minimum: 1,
    maximum: 100,
    default: 10,
  })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit = 10;
}
