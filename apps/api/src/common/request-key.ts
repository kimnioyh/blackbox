import { BadRequestException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';

export function requestKey(header: string | undefined): string {
  if (header === undefined) return randomUUID();
  const key = header.trim();
  if (!key || key.length > 200) throw new BadRequestException({ code: 'INVALID_IDEMPOTENCY_KEY', message: 'Idempotency-Key must contain 1–200 characters' });
  return key;
}
