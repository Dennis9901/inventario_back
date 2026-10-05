import { BadRequestException, Injectable } from '@nestjs/common';
import type { PipeTransform } from '@nestjs/common';

@Injectable()
export class SinCuerpoPipe implements PipeTransform<unknown, void> {
  transform(value: unknown): void {
    if (value === undefined) return;
    if (
      value &&
      typeof value === 'object' &&
      !Array.isArray(value) &&
      Object.keys(value).length === 0
    )
      return;
    throw new BadRequestException('Esta acción requiere body vacío');
  }
}
