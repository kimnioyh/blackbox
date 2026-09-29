import 'reflect-metadata';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Prisma } from '../generated/prisma/client.js';
import type { PrismaService } from '../prisma/prisma.service.js';
import type { EventsService } from '../events/events.service.js';
import type { KilnService } from '../kiln/kiln.service.js';
import { PoliciesService } from './policies.service.js';

test('a blocked check atomically records the check and blocking outcome without a payment', async () => {
  const appended: Array<{ key: string; type: string }> = [];
  let updatedStatus: string | undefined;
  const tx = {
    event: {
      findUnique: async () => null,
      findFirst: async () => ({ payload: {
        action: 'PURCHASE', merchant: 'Amazon', item: { name: 'Keyboard' },
        subtotal: '48.00', estimatedFee: '4.00', estimatedTotal: '52.00', currency: 'USD',
      } }),
    },
    case: {
      findUnique: async () => ({ id: 'case-1', currentPolicyVersion: 1 }),
      update: async ({ data }: any) => { updatedStatus = data.status; },
    },
    policy: {
      findUnique: async () => ({
        id: 'policy-1', maxAmount: new Prisma.Decimal('50.00'), currency: 'USD',
        allowedMerchants: ['Amazon'], deadline: null,
      }),
    },
  };
  const prisma = { $transaction: async (callback: (value: typeof tx) => Promise<unknown>) => callback(tx) } as unknown as PrismaService;
  const events = { appendInTransaction: async (_tx: unknown, _caseId: string, key: string, input: { eventType: string }) => {
    appended.push({ key, type: input.eventType });
  } } as unknown as EventsService;
  const service = new PoliciesService(prisma, events, {} as KilnService);
  const outcome = await service.check('case-1', 'check-1');

  assert.equal(outcome.result, 'BLOCK');
  assert.deepEqual(outcome.reasonCodes, ['BUDGET_EXCEEDED']);
  assert.deepEqual(appended, [
    { key: 'policy-check:check-1', type: 'POLICY_CHECK' },
    { key: 'payment-blocked:check-1', type: 'PAYMENT_BLOCKED' },
  ]);
  assert.equal(updatedStatus, 'BLOCKED');
});

test('policy parsing saves a version, timeline event, and observed Kiln usage counts', async () => {
  const instruction = { id: 'instruction-1', payload: { text: 'Buy a keyboard from Amazon for no more than $50.' } };
  let savedPolicy: any;
  let savedInvocation: any;
  let caseUpdate: any;
  let parsedEvent: any;
  const tx = {
    event: { findUnique: async () => null, findFirst: async () => instruction },
    case: {
      findUnique: async () => ({ id: 'case-1', currentPolicyVersion: null }),
      update: async ({ data }: any) => { caseUpdate = data; },
    },
    policy: { create: async ({ data }: any) => { savedPolicy = { id: 'policy-1', ...data }; return savedPolicy; } },
  };
  const prisma = {
    case: { findUnique: async () => ({ id: 'case-1' }) },
    event: { findUnique: async () => null, findFirst: async () => instruction },
    modelInvocation: { create: async ({ data }: any) => { savedInvocation = data; } },
    $transaction: async (callback: (value: typeof tx) => Promise<unknown>) => callback(tx),
  } as unknown as PrismaService;
  const events = { appendInTransaction: async (_tx: unknown, _caseId: string, _key: string, input: unknown) => {
    parsedEvent = input;
    return { id: 'event-1', payload: (input as any).payload };
  } } as unknown as EventsService;
  const kiln = { parsePolicy: async () => ({
    policy: { maxAmount: '50.00', currency: 'USD', allowedMerchants: ['Amazon'], deadline: null },
    model: 'qwen3-32b', inputTokens: 106, outputTokens: 268, totalTokens: 374, latencyMs: 4687,
  }) } as KilnService;

  const result = await new PoliciesService(prisma, events, kiln).parse('case-1', 'parse-1');
  assert.equal(result.policy.version, 1);
  assert.equal(savedPolicy.maxAmount, '50.00');
  assert.deepEqual(caseUpdate, { currentPolicyVersion: 1, status: 'IN_PROGRESS' });
  assert.equal(parsedEvent.eventType, 'POLICY_PARSED');
  assert.equal(parsedEvent.payload.policyId, 'policy-1');
  assert.deepEqual([savedInvocation.inputTokens, savedInvocation.outputTokens, savedInvocation.totalTokens], [106, 268, 374]);
});
