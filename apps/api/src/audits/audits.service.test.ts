import 'reflect-metadata';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { PrismaService } from '../prisma/prisma.service.js';
import type { EventsService } from '../events/events.service.js';
import type { KilnService } from '../kiln/kiln.service.js';
import { KilnAuditResponseError } from '../kiln/kiln.service.js';
import type { ProofsService } from '../blockchain/proofs.service.js';
import { AuditsService } from './audits.service.js';

test('an idempotent audit with a stored proof reports on-chain verification', async () => {
  let verificationCalls = 0;
  const prisma = {
    event: { findUnique: async () => ({ eventType: 'AUDIT_RESULT', payload: { auditId: 'audit-1' } }) },
    auditResult: { findUnique: async () => ({ id: 'audit-1', verdict: 'COMPLIANT', violations: [] }) },
    blockchainProof: { findFirst: async () => ({ id: 'proof-1' }) },
  } as unknown as PrismaService;
  const proofs = { verify: async () => { verificationCalls++; return { verified: true }; } } as unknown as ProofsService;
  const result = await new AuditsService(prisma, {} as EventsService, {} as KilnService, proofs).create('case-1', 'same-key');
  assert.equal(result.proofVerified, true);
  assert.equal(verificationCalls, 1);
});

test('a failed Qwen audit records a failed invocation without an AuditResult', async () => {
  let invocation: any;
  let auditWrites = 0;
  const prisma = {
    event: { findUnique: async () => null, findMany: async () => [] },
    case: { findUnique: async () => ({ id: 'case-1', currentPolicyVersion: null }) },
    blockchainProof: { findFirst: async () => null },
    payment: { findFirst: async () => null },
    approval: { findFirst: async () => null },
    modelInvocation: { create: async ({ data }: any) => { invocation = data; } },
    auditResult: { create: async () => { auditWrites++; } },
  } as unknown as PrismaService;
  const kiln = { explainAudit: async () => { throw new KilnAuditResponseError('KILN_INVALID_AUDIT', 'Invalid audit output',
    { model: 'qwen3-32b', inputTokens: 20, outputTokens: 22, totalTokens: 42, latencyMs: 100 }); } } as unknown as KilnService;
  const service = new AuditsService(prisma, {} as EventsService, kiln, {} as ProofsService);
  await assert.rejects(() => service.create('case-1', 'bad-output'), /Invalid audit output/);
  assert.equal(invocation.success, false);
  assert.equal(invocation.totalTokens, 42);
  assert.equal(auditWrites, 0);
});
