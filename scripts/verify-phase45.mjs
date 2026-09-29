import assert from 'node:assert/strict';

const api = 'http://localhost:3000/api/v1';
async function call(method, path, body, key) {
  const response = await fetch(`${api}${path}`, {
    method, headers: { ...(body ? { 'content-type': 'application/json' } : {}), ...(key ? { 'Idempotency-Key': key } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const data = await response.json();
  if (!response.ok) throw new Error(`${method} ${path}: ${response.status} ${JSON.stringify(data)}`);
  return data;
}

async function scenario(name, limit, decisionAmount, fee, expected) {
  const relatedCase = await call('POST', '/cases', { title: `Phase 4 ${name}` });
  const path = `/cases/${relatedCase.id}`;
  const common = { source: 'REST_API', verificationLevel: 'SELF_REPORTED', occurredAt: new Date().toISOString() };
  await call('POST', `${path}/events`, { ...common, eventType: 'USER_INSTRUCTION', actorType: 'USER',
    payload: { text: `Buy a keyboard from Amazon for no more than $${limit}.`, locale: 'en' } }, `${name}-instruction`);
  const parsed = await call('POST', `${path}/policy/parse`, undefined, `${name}-parse`);
  assert.equal(parsed.policy.maxAmount, `${limit}.00`);
  assert.ok(parsed.policy.allowedMerchants.includes('Amazon'));
  const total = (Number(decisionAmount) + Number(fee)).toFixed(2);
  await call('POST', `${path}/events`, { ...common, eventType: 'AGENT_DECISION', actorType: 'AGENT',
    payload: { action: 'PURCHASE', merchant: 'Amazon', item: { name: 'Keyboard' },
      subtotal: `${decisionAmount}.00`, estimatedFee: `${fee}.00`, estimatedTotal: total, currency: 'USD' } }, `${name}-decision`);
  const check = await call('POST', `${path}/policy/check`, undefined, `${name}-check`);
  assert.equal(check.result, expected);
  if (expected === 'BLOCK') assert.ok(check.reasonCodes.includes('BUDGET_EXCEEDED'));
  return { path, check };
}

const normal = await scenario('normal', 50, 42, 3, 'ALLOW');
const approved = await call('POST', `${normal.path}/approvals`, { decision: 'APPROVED', approvedAmount: '45.00', currency: 'USD' }, 'normal-approval');
assert.equal(approved.approval.approvedAmount, '45.00');
assert.equal(approved.event.eventType, 'HUMAN_APPROVAL');
const paid = await call('POST', `${normal.path}/payments`, { externalPaymentId: 'normal-external-payment', merchant: 'Amazon', subtotal: '42.00', fee: '3.00', totalAmount: '45.00', currency: 'USD', status: 'SUCCESS', executedAt: new Date().toISOString() }, 'normal-payment');
assert.equal(paid.payment.totalAmount, '45.00');
assert.equal(paid.event.eventType, 'PAYMENT_EXECUTED');
const normalDetail = await call('GET', normal.path);
assert.equal(normalDetail.payments.length, 1);
assert.equal(normalDetail.approvals.length, 1);

const blocked = await scenario('blocked', 30, 40, 2, 'BLOCK');
const blockedDetail = await call('GET', blocked.path);
assert.equal(blockedDetail.status, 'BLOCKED');
assert.ok(blockedDetail.events.some((event) => event.eventType === 'PAYMENT_BLOCKED'));
assert.equal(blockedDetail.payments.length, 0);
const bypassPayment = await call('POST', `${blocked.path}/payments`, { externalPaymentId: 'blocked-bypass-payment', merchant: 'Amazon', subtotal: '40.00', fee: '2.00', totalAmount: '42.00', currency: 'USD', status: 'SUCCESS' }, 'blocked-bypass-payment');
assert.equal(bypassPayment.payment.status, 'SUCCESS');
const blockedAfterBypass = await call('GET', blocked.path);
assert.equal(blockedAfterBypass.status, 'BLOCKED');
assert.equal(blockedAfterBypass.payments.length, 1);

const dispute = await scenario('dispute', 30, 28, 0, 'ALLOW');
const charged = await call('POST', `${dispute.path}/payments`, { externalPaymentId: 'dispute-external-payment', merchant: 'Amazon', subtotal: '28.00', fee: '4.00', totalAmount: '32.00', currency: 'USD', status: 'SUCCESS' }, 'dispute-payment');
assert.equal(charged.payment.totalAmount, '32.00');
const raised = await call('POST', `${dispute.path}/disputes`, { reason: 'Charged $32 over my $30 budget', disputedPaymentId: charged.payment.id }, 'dispute-created');
assert.equal(raised.status, 'DISPUTED');
const disputeDetail = await call('GET', dispute.path);
assert.equal(disputeDetail.status, 'DISPUTED');
assert.equal(disputeDetail.payments[0].status, 'SUCCESS');
assert.ok(disputeDetail.events.some((event) => event.eventType === 'DISPUTE_CREATED'));

const proofResponse = await fetch(`${api}${normal.path}/proofs`, { method: 'POST', headers: { 'Idempotency-Key': 'normal-proof' } });
const proofResult = await proofResponse.json();
if (proofResponse.status === 503) {
  assert.equal(proofResult.code, 'CHAIN_CONFIG_MISSING');
} else {
  assert.equal(proofResponse.status, 201, JSON.stringify(proofResult));
  const verification = await call('GET', `${normal.path}/proofs/verify`);
  assert.equal(verification.verified, true);
}

process.stdout.write(JSON.stringify({ normal: { caseId: normal.path.split('/').at(-1), result: normal.check.result, payment: paid.payment.status, events: normalDetail.events.map((event) => event.eventType) },
  blocked: { caseId: blocked.path.split('/').at(-1), result: blocked.check.result, status: blockedDetail.status, automaticPayments: blockedDetail.payments.length, laterExternalPayment: blockedAfterBypass.payments[0].status, events: blockedAfterBypass.events.map((event) => event.eventType) },
  dispute: { caseId: dispute.path.split('/').at(-1), payment: charged.payment.status, status: disputeDetail.status, events: disputeDetail.events.map((event) => event.eventType) },
  proofStatus: proofResponse.status, proof: proofResponse.status === 503 ? proofResult.message : { txHash: proofResult.txHash, chainId: proofResult.chainId } }, null, 2) + '\n');
