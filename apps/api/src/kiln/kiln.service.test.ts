import assert from 'node:assert/strict';
import { test } from 'node:test';
import { KilnService } from './kiln.service.js';

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
