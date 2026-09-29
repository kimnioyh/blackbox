import { hashCanonical } from '@blackbox/blockchain';
import type { PrismaService } from '../prisma/prisma.service.js';

/** Snapshot stops at evidenceSequence, so proof events and later activity never alter this digest. */
export async function caseEvidence(prisma: PrismaService, caseId: string, evidenceSequence: number) {
  const [relatedCase, events] = await Promise.all([
    prisma.case.findUnique({ where: { id: caseId }, select: {
      id: true, title: true, organizationId: true, ownerUserId: true, agentId: true,
      externalUserId: true, externalCaseId: true, createdAt: true,
    } }),
    prisma.event.findMany({ where: { caseId, sequence: { lte: evidenceSequence } }, orderBy: { sequence: 'asc' } }),
  ]);
  if (!relatedCase) return null;
  if (events.length !== evidenceSequence || events.some((event, index) => event.sequence !== index + 1)) {
    throw new Error('Case evidence sequence is incomplete');
  }
  const payloadId = (eventType: string, key: string) => events
    .filter((event) => event.eventType === eventType)
    .map((event) => event.payload && typeof event.payload === 'object' && !Array.isArray(event.payload) ? event.payload[key] : null)
    .filter((id): id is string => typeof id === 'string');
  const policyIds = payloadId('POLICY_PARSED', 'policyId');
  const approvalIds = payloadId('HUMAN_APPROVAL', 'approvalId');
  const paymentIds = payloadId('PAYMENT_EXECUTED', 'paymentId');
  const [policies, approvals, payments] = await Promise.all([
    prisma.policy.findMany({ where: { caseId, id: { in: policyIds } }, orderBy: { version: 'asc' } }),
    prisma.approval.findMany({ where: { caseId, id: { in: approvalIds } }, orderBy: { createdAt: 'asc' } }),
    prisma.payment.findMany({ where: { caseId, id: { in: paymentIds } }, orderBy: { createdAt: 'asc' } }),
  ]);
  if (policies.length !== policyIds.length || approvals.length !== approvalIds.length || payments.length !== paymentIds.length) {
    throw new Error('Case evidence rows are incomplete');
  }
  return {
    format: 'blackbox-case-evidence-v1',
    case: { ...relatedCase, createdAt: relatedCase.createdAt.toISOString() },
    evidenceSequence,
    events: events.map((event) => ({
      id: event.id, caseId: event.caseId, idempotencyKey: event.idempotencyKey,
      sequence: event.sequence, eventType: event.eventType, actorType: event.actorType,
      actorId: event.actorId, source: event.source, verificationLevel: event.verificationLevel,
      payload: event.payload, previousEventHash: event.previousEventHash, eventHash: event.eventHash,
      occurredAt: event.occurredAt.toISOString(), receivedAt: event.receivedAt.toISOString(),
    })),
    policies: policies.map((policy) => ({ ...policy,
      maxAmount: policy.maxAmount?.toFixed(2) ?? null,
      deadline: policy.deadline?.toISOString() ?? null, createdAt: policy.createdAt.toISOString(),
    })),
    approvals: approvals.map((approval) => ({ ...approval,
      approvedAmount: approval.approvedAmount?.toFixed(2) ?? null, createdAt: approval.createdAt.toISOString(),
    })),
    payments: payments.map((payment) => ({ ...payment,
      subtotal: payment.subtotal.toFixed(2), fee: payment.fee.toFixed(2),
      totalAmount: payment.totalAmount.toFixed(2),
      executedAt: payment.executedAt?.toISOString() ?? null, createdAt: payment.createdAt.toISOString(),
    })),
  };
}

export function evidenceHash(snapshot: NonNullable<Awaited<ReturnType<typeof caseEvidence>>>) {
  return hashCanonical(snapshot);
}
