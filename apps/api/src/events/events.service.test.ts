import 'reflect-metadata';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { hashCanonical } from '@blackbox/blockchain';
import { AppendEventRequestSchema } from '@blackbox/shared';
import { EventsService } from './events.service.js';
import type { PrismaService } from '../prisma/prisma.service.js';

test('appends sequenced, chained events and returns the original on an idempotent retry', async () => {
  const stored: any[] = [];
  const tx = {
    case: { findUnique: async () => ({ id: 'case-1' }) },
    event: {
      findUnique: async ({ where }: any) => stored.find((event) => event.idempotencyKey === where.caseId_idempotencyKey.idempotencyKey) ?? null,
      findFirst: async () => stored.at(-1) ?? null,
      create: async ({ data }: any) => { const event = { ...data }; stored.push(event); return event; },
    },
  };
  const prisma = { $transaction: async (callback: (value: typeof tx) => Promise<unknown>) => callback(tx) } as unknown as PrismaService;
  const service = new EventsService(prisma);
  const base = {
    eventType: 'USER_INSTRUCTION', actorType: 'USER', source: 'REST_API',
    verificationLevel: 'SELF_REPORTED', occurredAt: '2026-09-29T00:00:00.000Z',
    payload: { text: 'Buy a keyboard under $50.' },
  };
  const first = AppendEventRequestSchema.parse({ ...base, idempotencyKey: 'request-1' });
  const second = AppendEventRequestSchema.parse({ ...base, idempotencyKey: 'request-2' });
  const one = await service.append('case-1', 'request-1', first);
  const duplicate = await service.append('case-1', 'request-1', first);
  const two = await service.append('case-1', 'request-2', second);

  assert.equal(duplicate.id, one.id);
  assert.equal(stored.length, 2);
  assert.equal(one.sequence, 1);
  assert.equal(two.sequence, 2);
  assert.equal(one.previousEventHash, null);
  assert.equal(two.previousEventHash, one.eventHash);
  assert.equal(one.eventHash, hashCanonical({
    id: one.id, caseId: one.caseId, sequence: one.sequence, idempotencyKey: one.idempotencyKey,
    eventType: one.eventType, actorType: one.actorType, actorId: one.actorId,
    source: one.source, verificationLevel: one.verificationLevel,
    occurredAt: one.occurredAt.toISOString(), payload: one.payload,
    previousEventHash: null, receivedAt: one.receivedAt.toISOString(),
  }));
  await assert.rejects(() => service.append('case-1', 'request-1',
    AppendEventRequestSchema.parse({ ...base, payload: { text: 'Different instruction' } })),
  (error: any) => error.status === 409);
});
