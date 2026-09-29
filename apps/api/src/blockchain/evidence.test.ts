import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { PrismaService } from '../prisma/prisma.service.js';
import { caseEvidence, evidenceHash } from './evidence.js';

test('proof snapshot stays fixed after a proof event and detects historical changes', async () => {
  const first = { id: 'event-1', caseId: 'case-1', idempotencyKey: 'instruction', sequence: 1,
    eventType: 'USER_INSTRUCTION', actorType: 'USER', actorId: null, source: 'REST_API',
    verificationLevel: 'SELF_REPORTED', payload: { text: 'Buy under $50' },
    previousEventHash: null, eventHash: '0xfirst', occurredAt: new Date('2026-01-01T00:00:00Z'),
    receivedAt: new Date('2026-01-01T00:00:01Z') };
  const later = { ...first, id: 'event-2', sequence: 2, eventType: 'PROOF_RECORDED',
    previousEventHash: '0xfirst', eventHash: '0xsecond', payload: { proofId: 'proof-1' } };
  let events: Array<typeof first | typeof later> = [first];
  const prisma = {
    case: { findUnique: async () => ({ id: 'case-1', title: 'Keyboard', organizationId: null,
      ownerUserId: null, agentId: null, externalUserId: null, externalCaseId: null,
      createdAt: new Date('2026-01-01T00:00:00Z') }) },
    event: { findMany: async ({ where }: { where: { sequence: { lte: number } } }) => events.filter((event) => event.sequence <= where.sequence.lte) },
    policy: { findMany: async () => [] }, approval: { findMany: async () => [] }, payment: { findMany: async () => [] },
  } as unknown as PrismaService;
  const original = await caseEvidence(prisma, 'case-1', 1);
  assert.ok(original);
  const originalHash = evidenceHash(original);
  events = [first, later];
  const afterProof = await caseEvidence(prisma, 'case-1', 1);
  assert.ok(afterProof);
  assert.equal(evidenceHash(afterProof), originalHash);
  events = [{ ...first, payload: { text: 'Buy under $500' } }, later];
  const tampered = await caseEvidence(prisma, 'case-1', 1);
  assert.ok(tampered);
  assert.notEqual(evidenceHash(tampered), originalHash);
});
