import assert from 'node:assert/strict';
import { test } from 'node:test';
import { KilnService } from './kiln.service.js';
import type { CaseAuditInput } from '@blackbox/shared';

test('parses the observed Kiln chat completion and token usage shape', async () => {
  const originalFetch = globalThis.fetch;
  const originalKey = process.env.KILN_API_KEY;
  process.env.KILN_API_KEY = 'test-only-key';
  globalThis.fetch = async (_url, init) => {
    const request = JSON.parse(String(init?.body));
    assert.equal(request.model, 'qwen3-32b');
    assert.equal(request.response_format, undefined);
    return new Response(JSON.stringify({
      model: 'qwen3-32b', choices: [{ message: { content: '\n\n{"maxAmount":"50.00","currency":"USD","allowedMerchants":["Amazon"],"deadline":null}' }, finish_reason: 'stop' }],
      usage: { prompt_tokens: 90, completion_tokens: 366, total_tokens: 456, cost: 0.00010952 },
    }), { status: 200 });
  };
  try {
    const result = await new KilnService().parsePolicy('Buy a keyboard from Amazon for no more than $50.');
    assert.equal(result.policy.maxAmount, '50.00');
    assert.deepEqual(result.policy.allowedMerchants, ['Amazon']);
    assert.deepEqual([result.inputTokens, result.outputTokens, result.totalTokens], [90, 366, 456]);
  } finally {
    globalThis.fetch = originalFetch;
    if (originalKey === undefined) delete process.env.KILN_API_KEY;
    else process.env.KILN_API_KEY = originalKey;
  }
});

test('validates a structured audit and records observed Qwen token usage', async () => {
  const originalFetch = globalThis.fetch;
  const originalKey = process.env.KILN_API_KEY;
  process.env.KILN_API_KEY = 'test-only-key';
  const input: CaseAuditInput = {
    missingEvidence: [],
    instruction: 'Buy from Amazon for no more than $30.',
    policy: { maxAmount: '30.00', currency: 'USD', allowedMerchants: ['Amazon'], deadline: null },
    agentDecision: null, policyCheck: null, approval: null,
    payment: { merchant: 'Amazon', subtotal: '28.00', fee: '4.00', totalAmount: '32.00', currency: 'USD', status: 'SUCCESS', executedAt: null },
    dispute: { reason: 'Overcharged', disputedPaymentId: null }, proof: null,
    paymentChecks: [{ rule: 'MAX_AMOUNT', expected: '30.00 USD', actual: '32.00 USD', result: 'FAIL' }],
    expectedVerdict: 'VIOLATION',
  };
  globalThis.fetch = async (_url, init) => {
    const request = JSON.parse(String(init?.body));
    assert.equal(request.model, 'qwen3-32b');
    assert.equal(request.response_format, undefined);
    return new Response(JSON.stringify({ model: 'qwen3-32b',
      choices: [{ message: { content: '{"verdict":"VIOLATION","summary":"The $32.00 charge exceeded the $30.00 budget.","violations":[{"rule":"MAX_AMOUNT","description":"Allowed 30.00 USD; actual 32.00 USD."}]}' }, finish_reason: 'stop' }],
      usage: { prompt_tokens: 120, completion_tokens: 80, total_tokens: 200 },
    }), { status: 200 });
  };
  try {
    const result = await new KilnService().explainAudit(input);
    assert.equal(result.audit.verdict, 'VIOLATION');
    assert.deepEqual([result.inputTokens, result.outputTokens, result.totalTokens], [120, 80, 200]);
  } finally {
    globalThis.fetch = originalFetch;
    if (originalKey === undefined) delete process.env.KILN_API_KEY;
    else process.env.KILN_API_KEY = originalKey;
  }
});
