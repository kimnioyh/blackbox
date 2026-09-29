import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Prisma } from '../generated/prisma/client.js';
import type { PrismaService } from '../prisma/prisma.service.js';
import { buildAuditEvidence } from './audit-evidence.js';

const instruction = { sequence: 1, eventType: 'USER_INSTRUCTION', payload: { text: 'Buy a keyboard from Amazon under $50.' } };
const parsed = { sequence: 2, eventType: 'POLICY_PARSED', payload: { policyId: 'policy-1' } };
const decision = { sequence: 3, eventType: 'AGENT_DECISION', payload: { action: 'PURCHASE', merchant: 'Amazon', item: { name: 'Keyboard' }, subtotal: '42.00', estimatedFee: '3.00', estimatedTotal: '45.00', currency: 'USD' } };
const executed = { sequence: 4, eventType: 'PAYMENT_EXECUTED', payload: { paymentId: 'payment-1' } };

function store(limit: string, total: string, events: unknown[] = [instruction, parsed, decision, executed], paymentPresent = true, merchant = 'Amazon', deadline: Date | null = null) {
  const payment = paymentPresent ? { id: 'payment-1', merchant, subtotal: new Prisma.Decimal(total).minus(3), fee: new Prisma.Decimal(3),
    totalAmount: new Prisma.Decimal(total), currency: 'USD', status: 'SUCCESS', executedAt: new Date('2026-09-29T00:00:00Z') } : null;
  return {
    case: { findUnique: async () => ({ id: 'case-1', currentPolicyVersion: 1 }) },
    event: { findMany: async () => events },
    payment: { findFirst: async () => payment },
    policy: { findFirst: async () => ({ id: 'policy-1', maxAmount: new Prisma.Decimal(limit), currency: 'USD',
      allowedMerchants: ['Amazon'], deadline }), findUnique: async () => null },
    approval: { findFirst: async () => null },
    blockchainProof: { findFirst: async () => null },
  } as unknown as PrismaService;
}

test('a $45 Amazon payment under a $50 policy is compliant', async () => {
  const input = await buildAuditEvidence(store('50.00', '45.00'), 'case-1', null);
  assert.equal(input?.expectedVerdict, 'COMPLIANT');
  assert.deepEqual(input?.paymentChecks.map((check) => check.result), ['PASS', 'PASS']);
  assert.equal(input?.payment?.totalAmount, '45.00');
});

test('a $32 payment including a $4 fee violates the $30 budget', async () => {
  const input = await buildAuditEvidence(store('30.00', '32.00'), 'case-1', null);
  assert.equal(input?.expectedVerdict, 'VIOLATION');
  assert.deepEqual(input?.paymentChecks.filter((check) => check.result === 'FAIL').map((check) => check.rule), ['MAX_AMOUNT']);
  assert.equal(input?.payment?.totalAmount, '32.00');
});

test('a Case without a completed payment is inconclusive', async () => {
  const input = await buildAuditEvidence(store('50.00', '45.00', [instruction, parsed, decision], false), 'case-1', null);
  assert.equal(input?.expectedVerdict, 'INCONCLUSIVE');
  assert.equal(input?.payment, null);
});

test('a later payment at another merchant and after the deadline fails both rules', async () => {
  const input = await buildAuditEvidence(store('50.00', '45.00', [instruction, parsed, decision, executed], true,
    'Other Merchant', new Date('2026-09-28T00:00:00Z')), 'case-1', null);
  assert.equal(input?.expectedVerdict, 'VIOLATION');
  assert.deepEqual(input?.paymentChecks.filter((check) => check.result === 'FAIL').map((check) => check.rule), ['ALLOWED_MERCHANT', 'DEADLINE']);
});
