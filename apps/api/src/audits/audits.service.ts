import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { FinancialEventInputSchema } from '@blackbox/shared';
import { Prisma } from '../generated/prisma/client.js';
import { ProofsService } from '../blockchain/proofs.service.js';
import { EventsService } from '../events/events.service.js';
import { KilnAuditResponseError, KilnService } from '../kiln/kiln.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { buildAuditEvidence } from './audit-evidence.js';

@Injectable()
export class AuditsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly events: EventsService,
    private readonly kiln: KilnService,
    private readonly proofs: ProofsService,
  ) {}

  private async previous(caseId: string, eventKey: string) {
    const event = await this.prisma.event.findUnique({ where: { caseId_idempotencyKey: { caseId, idempotencyKey: eventKey } } });
    if (!event) return null;
    const auditId = event.payload && typeof event.payload === 'object' && !Array.isArray(event.payload) ? event.payload.auditId : null;
    if (event.eventType !== 'AUDIT_RESULT' || typeof auditId !== 'string') throw new ConflictException({ code: 'IDEMPOTENCY_CONFLICT', message: 'Request key belongs to another event' });
    const audit = await this.prisma.auditResult.findUnique({ where: { id: auditId } });
    if (!audit) throw new ConflictException({ code: 'AUDIT_EVENT_MISMATCH', message: 'Recorded audit event has no audit result' });
    const proof = await this.prisma.blockchainProof.findFirst({ where: { caseId }, select: { id: true } });
    return { audit, event, proofVerified: proof ? (await this.proofs.verify(caseId)).verified : null };
  }

  async create(caseId: string, requestKey: string) {
    const eventKey = `audit:${requestKey}`;
    const prior = await this.previous(caseId, eventKey);
    if (prior) return prior;
    const relatedCase = await this.prisma.case.findUnique({ where: { id: caseId }, select: { id: true } });
    if (!relatedCase) throw new NotFoundException({ code: 'CASE_NOT_FOUND', message: 'Case not found' });
    const proof = await this.prisma.blockchainProof.findFirst({ where: { caseId }, select: { id: true } });
    const proofVerified = proof ? (await this.proofs.verify(caseId)).verified : null;
    const input = await buildAuditEvidence(this.prisma, caseId, proofVerified);
    if (!input) throw new NotFoundException({ code: 'CASE_NOT_FOUND', message: 'Case not found' });
    const started = Date.now();
    let result;
    try { result = await this.kiln.explainAudit(input); }
    catch (error) {
      const observed = error instanceof KilnAuditResponseError ? error.usage : null;
      await this.prisma.modelInvocation.create({ data: {
        caseId, flowType: 'AUDIT_EXPLANATION', model: observed?.model ?? process.env.KILN_MODEL ?? 'qwen3-32b',
        inputTokens: observed?.inputTokens ?? 0, outputTokens: observed?.outputTokens ?? 0,
        totalTokens: observed?.totalTokens ?? 0, latencyMs: observed?.latencyMs ?? Date.now() - started,
        success: false, errorMessage: error instanceof Error ? error.message.slice(0, 500) : 'Kiln audit failed',
      } });
      throw error;
    }
    // Record every actual model call, including a concurrent duplicate that loses the audit write.
    await this.prisma.modelInvocation.create({ data: {
      caseId, flowType: 'AUDIT_EXPLANATION', model: result.model,
      inputTokens: result.inputTokens, outputTokens: result.outputTokens,
      totalTokens: result.totalTokens, latencyMs: result.latencyMs, success: true,
    } });
    for (let attempt = 0; attempt < 5; attempt++) {
      try {
        return await this.prisma.$transaction(async (tx) => {
          const existing = await tx.event.findUnique({ where: { caseId_idempotencyKey: { caseId, idempotencyKey: eventKey } } });
          if (existing) {
            const auditId = existing.payload && typeof existing.payload === 'object' && !Array.isArray(existing.payload) ? existing.payload.auditId : null;
            if (existing.eventType !== 'AUDIT_RESULT' || typeof auditId !== 'string') throw new ConflictException({ code: 'IDEMPOTENCY_CONFLICT', message: 'Request key belongs to another event' });
            const audit = await tx.auditResult.findUnique({ where: { id: auditId } });
            if (!audit) throw new ConflictException({ code: 'AUDIT_EVENT_MISMATCH', message: 'Recorded audit event has no audit result' });
            return { audit, event: existing, proofVerified };
          }
          const audit = await tx.auditResult.create({ data: {
            caseId, verdict: result.audit.verdict, summary: result.audit.summary,
            violations: result.audit.violations, model: result.model,
          } });
          const event = await this.events.appendInTransaction(tx, caseId, eventKey, FinancialEventInputSchema.parse({
            eventType: 'AUDIT_RESULT', actorType: 'SYSTEM', source: 'INTERNAL',
            verificationLevel: 'SELF_REPORTED', occurredAt: new Date().toISOString(),
            payload: { auditId: audit.id, verdict: audit.verdict, summary: audit.summary, violations: result.audit.violations },
          }));
          if (input.expectedVerdict === 'COMPLIANT') {
            const current = await tx.case.findUnique({ where: { id: caseId }, select: { status: true } });
            if (current && !['DISPUTED', 'BLOCKED', 'CLOSED'].includes(current.status)) {
              await tx.case.update({ where: { id: caseId }, data: { status: 'VERIFIED' } });
            }
          }
          return { audit, event, proofVerified };
        }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
      } catch (error) {
        if (error instanceof Prisma.PrismaClientKnownRequestError && ['P2002', 'P2034'].includes(error.code)) continue;
        throw error;
      }
    }
    throw new ConflictException({ code: 'AUDIT_CONCURRENCY_CONFLICT', message: 'Could not save audit after concurrent updates; retry' });
  }
}
