import { BadRequestException } from '@nestjs/common';
import type { z } from 'zod';

export function parseBody<T>(schema: z.ZodType<T>, input: unknown): T {
  const result = schema.safeParse(input);
  if (!result.success) {
    throw new BadRequestException({ code: 'VALIDATION_ERROR', message: result.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`).join('; ') });
  }
  return result.data;
}
