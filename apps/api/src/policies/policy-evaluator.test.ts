import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Prisma } from '../generated/prisma/client.js';
import { evaluatePolicy } from './policy-evaluator.js';

test('the keyboard proposal is blocked on the total including the fee', () => {
  const outcome = evaluatePolicy({
    id: 'policy-1', maxAmount: new Prisma.Decimal('50.00'), currency: 'USD',
    allowedMerchants: ['Amazon'], deadline: null,
  }, {
    action: 'PURCHASE', merchant: 'Amazon', item: { name: 'Keyboard' },
    subtotal: '48.00', estimatedFee: '4.00', estimatedTotal: '52.00', currency: 'USD',
  }, new Date('2026-09-29T00:00:00Z'));
  assert.equal(outcome.result, 'BLOCK');
  assert.deepEqual(outcome.checks.map(({ rule, result }) => [rule, result]), [
    ['MAX_AMOUNT', 'FAIL'], ['ALLOWED_MERCHANT', 'PASS'],
  ]);
  assert.deepEqual(outcome.reasonCodes, ['BUDGET_EXCEEDED']);
});

test('merchant and deadline checks are deterministic', () => {
  const outcome = evaluatePolicy({
    id: 'policy-2', maxAmount: new Prisma.Decimal('100.00'), currency: 'USD',
    allowedMerchants: ['Amazon'], deadline: new Date('2026-09-28T23:59:59Z'),
  }, {
    action: 'PURCHASE', merchant: 'Another Store', item: { name: 'Keyboard' },
    subtotal: '42.00', estimatedFee: '3.00', estimatedTotal: '45.00', currency: 'USD',
  }, new Date('2026-09-29T00:00:00Z'));
  assert.deepEqual(outcome.checks.map(({ rule, result }) => [rule, result]), [
    ['MAX_AMOUNT', 'PASS'], ['ALLOWED_MERCHANT', 'FAIL'], ['DEADLINE', 'FAIL'],
  ]);
  assert.deepEqual(outcome.reasonCodes, ['MERCHANT_NOT_ALLOWED', 'DEADLINE_EXPIRED']);
});

test('a proposal cannot understate its total', () => {
  assert.throws(() => evaluatePolicy({
    id: 'policy-3', maxAmount: new Prisma.Decimal('50.00'), currency: 'USD',
    allowedMerchants: [], deadline: null,
  }, {
    action: 'PURCHASE', merchant: 'Amazon', item: { name: 'Keyboard' },
    subtotal: '48.00', estimatedFee: '4.00', estimatedTotal: '48.00', currency: 'USD',
  }, new Date()), (error: any) => error.status === 422);
});
