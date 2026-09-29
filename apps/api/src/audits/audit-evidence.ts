import { AgentDecisionPayloadSchema, CaseAuditInputSchema, PolicyCheckPayloadSchema, type CaseAuditInput } from '@blackbox/shared';
import { Prisma } from '../generated/prisma/client.js';
import type { PrismaService } from '../prisma/prisma.service.js';

type EvidenceStore = Pick<PrismaService, 'case' | 'event' | 'policy' | 'approval' | 'payment' | 'blockchainProof'>;

function objectPayload(value: Prisma.JsonValue): Prisma.JsonObject | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : null;
}

/** A compact, off-chain audit packet. Every financial comparison is made here, before Qwen. */
export async function buildAuditEvidence(db: EvidenceStore, caseId: string, proofVerified: boolean | null): Promise<CaseAuditInput | null> {
  const relatedCase = await db.case.findUnique({ where: { id: caseId }, select: { id: true, currentPolicyVersion: true } });
  if (!relatedCase) return null;
  const [events, successfulPayment, latestProof] = await Promise.all([
    db.event.findMany({ where: { caseId }, orderBy: { sequence: 'asc' } }),
    db.payment.findFirst({ where: { caseId, status: 'SUCCESS' }, orderBy: { createdAt: 'desc' } }),
    db.blockchainProof.findFirst({ where: { caseId }, orderBy: { createdAt: 'desc' } }),
  ]);
  const paymentEvent = successfulPayment ? [...events].reverse().find((event) => event.eventType === 'PAYMENT_EXECUTED' && objectPayload(event.payload)?.paymentId === successfulPayment.id) : null;
  const paymentSequence = paymentEvent?.sequence ?? Number.POSITIVE_INFINITY;
  const prior = (type: string) => [...events].reverse().find((event) => event.eventType === type && event.sequence < paymentSequence);
  const instructionEvent = events.find((event) => event.eventType === 'USER_INSTRUCTION');
  const instructionValue = instructionEvent ? objectPayload(instructionEvent.payload)?.text : null;
  const instruction = typeof instructionValue === 'string' ? instructionValue : null;
  const policyEvent = prior('POLICY_PARSED');
  const policyId = policyEvent ? objectPayload(policyEvent.payload)?.policyId : null;
  const policy = typeof policyId === 'string'
    ? await db.policy.findFirst({ where: { id: policyId, caseId } })
    : relatedCase.currentPolicyVersion === null ? null : await db.policy.findUnique({ where: { caseId_version: { caseId, version: relatedCase.currentPolicyVersion } } });
  const decisionEvent = prior('AGENT_DECISION');
  const decision = decisionEvent ? AgentDecisionPayloadSchema.safeParse(decisionEvent.payload) : null;
  const policyCheckEvent = prior('POLICY_CHECK');
  const policyCheck = policyCheckEvent ? PolicyCheckPayloadSchema.safeParse(policyCheckEvent.payload) : null;
  const disputeEvent = [...events].reverse().find((event) => event.eventType === 'DISPUTE_CREATED');
  const disputePayload = disputeEvent ? objectPayload(disputeEvent.payload) : null;
  const approvalEvent = [...events].reverse().find((event) => event.eventType === 'HUMAN_APPROVAL');
  const approvalId = approvalEvent ? objectPayload(approvalEvent.payload)?.approvalId : null;
  const applicableApproval = typeof approvalId === 'string' ? await db.approval.findFirst({ where: { id: approvalId, caseId } }) : null;

  const paymentChecks: CaseAuditInput['paymentChecks'] = [];
  if (policy && successfulPayment) {
    if (policy.maxAmount !== null) {
      const currencyMatches = policy.currency === null || policy.currency === successfulPayment.currency;
      const pass = currencyMatches && successfulPayment.totalAmount.lte(policy.maxAmount);
      paymentChecks.push({ rule: 'MAX_AMOUNT', expected: `${policy.maxAmount.toFixed(2)} ${policy.currency ?? successfulPayment.currency}`,
        actual: `${successfulPayment.totalAmount.toFixed(2)} ${successfulPayment.currency}`, result: pass ? 'PASS' : 'FAIL' });
    }
    const merchants = Array.isArray(policy.allowedMerchants) ? policy.allowedMerchants.filter((item): item is string => typeof item === 'string') : [];
    if (merchants.length) {
      const normalize = (value: string) => value.trim().toLocaleLowerCase('en-US');
      paymentChecks.push({ rule: 'ALLOWED_MERCHANT', expected: merchants.join(', '), actual: successfulPayment.merchant,
        result: merchants.some((merchant) => normalize(merchant) === normalize(successfulPayment.merchant)) ? 'PASS' : 'FAIL' });
    }
    if (policy.deadline) {
      paymentChecks.push({ rule: 'DEADLINE', expected: policy.deadline.toISOString(), actual: successfulPayment.executedAt?.toISOString() ?? 'UNKNOWN',
        result: successfulPayment.executedAt ? (successfulPayment.executedAt <= policy.deadline ? 'PASS' : 'FAIL') : 'UNKNOWN' });
    }
  }
  const expectedVerdict = paymentChecks.some((check) => check.result === 'FAIL') ? 'VIOLATION'
    : !instruction || !policy || !successfulPayment || paymentChecks.some((check) => check.result === 'UNKNOWN')
      ? 'INCONCLUSIVE' : 'COMPLIANT';
  const input = {
    missingEvidence: [
      ...(!instruction ? ['USER_INSTRUCTION' as const] : []),
      ...(!policy ? ['POLICY' as const] : []),
      ...(!successfulPayment ? ['PAYMENT' as const] : []),
    ],
    instruction,
    policy: policy ? { maxAmount: policy.maxAmount?.toFixed(2) ?? null, currency: policy.currency,
      allowedMerchants: Array.isArray(policy.allowedMerchants) ? policy.allowedMerchants : [], deadline: policy.deadline?.toISOString() ?? null } : null,
    agentDecision: decision?.success ? decision.data : null,
    policyCheck: policyCheck?.success ? policyCheck.data : null,
    approval: applicableApproval ? { decision: applicableApproval.decision, approvedAmount: applicableApproval.approvedAmount?.toFixed(2) ?? null,
      currency: applicableApproval.currency, beforePayment: paymentEvent ? approvalEvent!.sequence < paymentEvent.sequence : null } : null,
    payment: successfulPayment ? { merchant: successfulPayment.merchant, subtotal: successfulPayment.subtotal.toFixed(2),
      fee: successfulPayment.fee.toFixed(2), totalAmount: successfulPayment.totalAmount.toFixed(2),
      currency: successfulPayment.currency, status: successfulPayment.status,
      executedAt: successfulPayment.executedAt?.toISOString() ?? null } : null,
    dispute: typeof disputePayload?.reason === 'string' ? { reason: disputePayload.reason,
      disputedPaymentId: typeof disputePayload.disputedPaymentId === 'string' ? disputePayload.disputedPaymentId : null } : null,
    proof: latestProof ? { status: latestProof.status, verified: proofVerified === true } : null,
    paymentChecks, expectedVerdict,
  };
  return CaseAuditInputSchema.parse(input);
}
