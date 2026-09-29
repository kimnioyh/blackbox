import assert from 'node:assert/strict';

const api = process.env.API_BASE_URL ? `${process.env.API_BASE_URL.replace(/\/$/, '')}/api/v1` : 'http://localhost:3000/api/v1';

async function request(method, path, body, key) {
  const response = await fetch(`${api}${path}`, {
    method, headers: { ...(body ? { 'content-type': 'application/json' } : {}), ...(key ? { 'Idempotency-Key': key } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const data = await response.json();
  if (!response.ok) throw new Error(`${method} ${path}: HTTP ${response.status} ${JSON.stringify(data)}`);
  return data;
}

async function preparedCase(name, budget, subtotal, estimatedFee) {
  const relatedCase = await request('POST', '/cases', { title: `Phase 6 ${name}` });
  const path = `/cases/${relatedCase.id}`;
  const baseEvent = { source: 'REST_API', verificationLevel: 'SELF_REPORTED', occurredAt: new Date().toISOString() };
  await request('POST', `${path}/events`, { ...baseEvent, eventType: 'USER_INSTRUCTION', actorType: 'USER',
    payload: { text: `Buy a keyboard from Amazon for no more than $${budget}.`, locale: 'en' } }, 'instruction');
  const parsed = await request('POST', `${path}/policy/parse`, undefined, 'parse');
  assert.equal(parsed.policy.maxAmount, `${budget}.00`);
  const estimatedTotal = (subtotal + estimatedFee).toFixed(2);
  await request('POST', `${path}/events`, { ...baseEvent, eventType: 'AGENT_DECISION', actorType: 'AGENT',
    payload: { action: 'PURCHASE', merchant: 'Amazon', item: { name: 'Keyboard' }, subtotal: subtotal.toFixed(2),
      estimatedFee: estimatedFee.toFixed(2), estimatedTotal, currency: 'USD' } }, 'decision');
  const check = await request('POST', `${path}/policy/check`, undefined, 'check');
  assert.equal(check.result, 'ALLOW');
  return { id: relatedCase.id, path };
}

async function auditAndInspect(relatedCase, expectedVerdict, expectedStatus) {
  const result = await request('POST', `${relatedCase.path}/audits`, undefined, 'audit');
  assert.equal(result.audit.verdict, expectedVerdict);
  const detail = await request('GET', relatedCase.path);
  assert.equal(detail.status, expectedStatus);
  assert.equal(detail.audits.length, 1);
  assert.equal(detail.events.filter((event) => event.eventType === 'AUDIT_RESULT').length, 1);
  const invocation = detail.modelInvocations.find((item) => item.flowType === 'AUDIT_EXPLANATION' && item.success);
  assert.ok(invocation);
  assert.ok(invocation.totalTokens > 0);
  const usage = await request('GET', `/usage/summary?caseId=${relatedCase.id}`);
  assert.ok(usage.auditExplanation.callCount >= 1);
  assert.ok(usage.auditExplanation.totalTokens >= invocation.totalTokens);
  return { caseId: relatedCase.id, verdict: result.audit.verdict, status: detail.status,
    violations: result.audit.violations, proofVerified: result.proofVerified,
    tokens: { input: invocation.inputTokens, output: invocation.outputTokens, total: invocation.totalTokens } };
}

const normal = await preparedCase('normal', 50, 42, 3);
await request('POST', `${normal.path}/approvals`, { decision: 'APPROVED', approvedAmount: '45.00', currency: 'USD' }, 'approval');
await request('POST', `${normal.path}/payments`, { externalPaymentId: 'phase6-normal-payment', merchant: 'Amazon',
  subtotal: '42.00', fee: '3.00', totalAmount: '45.00', currency: 'USD', status: 'SUCCESS' }, 'payment');
const normalResult = await auditAndInspect(normal, 'COMPLIANT', 'VERIFIED');
assert.deepEqual(normalResult.violations, []);

const violation = await preparedCase('violation', 30, 28, 0);
const charged = await request('POST', `${violation.path}/payments`, { externalPaymentId: 'phase6-violation-payment',
  merchant: 'Amazon', subtotal: '28.00', fee: '4.00', totalAmount: '32.00', currency: 'USD', status: 'SUCCESS' }, 'payment');
await request('POST', `${violation.path}/disputes`, { reason: 'The $32 charge exceeded my $30 limit.', disputedPaymentId: charged.payment.id }, 'dispute');
const violationResult = await auditAndInspect(violation, 'VIOLATION', 'DISPUTED');
assert.ok(violationResult.violations.some((item) => item.rule === 'MAX_AMOUNT' && item.description.includes('30.00') && item.description.includes('32.00')));

const inconclusiveCase = await request('POST', '/cases', { title: 'Phase 6 insufficient evidence' });
const inconclusiveResult = await auditAndInspect({ id: inconclusiveCase.id, path: `/cases/${inconclusiveCase.id}` }, 'INCONCLUSIVE', 'CREATED');

process.stdout.write(JSON.stringify({ normal: normalResult, violation: violationResult, inconclusive: inconclusiveResult }, null, 2) + '\n');
