import { ConflictException, Injectable, NotFoundException, UnprocessableEntityException } from '@nestjs/common';
import {
  AgentDecisionPayloadSchema, FinancialEventInputSchema, PolicyCheckPayloadSchema,
  type ParsedPolicy,
} from '@blackbox/shared';
import { Prisma } from '../generated/prisma/client.js';
import { EventsService } from '../events/events.service.js';
import { KilnService } from '../kiln/kiln.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { serializePolicy } from '../common/serialize-policy.js';
import { evaluatePolicy } from './policy-evaluator.js';

function instructionText(payload: Prisma.JsonValue): string {
  const text = payload && typeof payload === 'object' && !Array.isArray(payload) ? payload.text : null;
  if (typeof text !== 'string' || !text.trim()) {
    throw new UnprocessableEntityException({ code: 'INVALID_INSTRUCTION', message: 'Latest instruction event has no text' });
  }
  return text;
}

@Injectable()
export class PoliciesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly events: EventsService,
    private readonly kiln: KilnService,
  ) {}

  private async priorParse(caseId: string, key: string) {
    const event = await this.prisma.event.findUnique({ where: { caseId_idempotencyKey: { caseId, idempotencyKey: key } } });
    if (!event) return null;
    const policyId = event.payload && typeof event.payload === 'object' && !Array.isArray(event.payload) ? event.payload.policyId : null;
    if (event.eventType !== 'POLICY_PARSED' || typeof policyId !== 'string') {
      throw new ConflictException({ code: 'IDEMPOTENCY_CONFLICT', message: 'Request key belongs to another event' });
    }
    const policy = await this.prisma.policy.findUnique({ where: { id: policyId } });
    if (!policy) throw new ConflictException({ code: 'POLICY_EVENT_MISMATCH', message: 'Recorded policy event has no policy' });
    return { policy: serializePolicy(policy), event };
  }

  async parse(caseId: string, requestKey: string) {
    const eventKey = `policy-parse:${requestKey}`;
    const previous = await this.priorParse(caseId, eventKey);
    if (previous) return previous;

    const relatedCase = await this.prisma.case.findUnique({ where: { id: caseId }, select: { id: true } });
    if (!relatedCase) throw new NotFoundException({ code: 'CASE_NOT_FOUND', message: 'Case not found' });
    const latest = await this.prisma.event.findFirst({ where: { caseId, eventType: 'USER_INSTRUCTION' }, orderBy: { sequence: 'desc' } });
    if (!latest) throw new UnprocessableEntityException({ code: 'INSTRUCTION_NOT_FOUND', message: 'No USER_INSTRUCTION exists for this case' });
    const text = instructionText(latest.payload);

    const started = Date.now();
    let result;
    try { result = await this.kiln.parsePolicy(text); }
    catch (error) {
      await this.prisma.modelInvocation.create({ data: {
        caseId, flowType: 'POLICY_EXTRACTION', model: process.env.KILN_MODEL ?? 'qwen3-32b',
        inputTokens: 0, outputTokens: 0, totalTokens: 0, latencyMs: Date.now() - started,
        success: false, errorMessage: error instanceof Error ? error.message.slice(0, 500) : 'Kiln request failed',
      } });
      throw error;
    }
    // Record the actual model call even if a concurrent request wins the policy write.
    await this.prisma.modelInvocation.create({ data: {
      caseId, flowType: 'POLICY_EXTRACTION', model: result.model,
      inputTokens: result.inputTokens, outputTokens: result.outputTokens,
      totalTokens: result.totalTokens, latencyMs: result.latencyMs,
      success: true,
    } });

    for (let attempt = 0; attempt < 5; attempt++) {
      try {
        return await this.prisma.$transaction(async (tx) => {
          const existing = await tx.event.findUnique({ where: { caseId_idempotencyKey: { caseId, idempotencyKey: eventKey } } });
          if (existing) {
            const policyId = existing.payload && typeof existing.payload === 'object' && !Array.isArray(existing.payload) ? existing.payload.policyId : null;
            if (existing.eventType !== 'POLICY_PARSED' || typeof policyId !== 'string') throw new ConflictException({ code: 'IDEMPOTENCY_CONFLICT', message: 'Request key belongs to another event' });
            const policy = await tx.policy.findUnique({ where: { id: policyId } });
            if (!policy) throw new ConflictException({ code: 'POLICY_EVENT_MISMATCH', message: 'Recorded policy event has no policy' });
            return { policy: serializePolicy(policy), event: existing };
          }
          const currentCase = await tx.case.findUnique({ where: { id: caseId } });
          if (!currentCase) throw new NotFoundException({ code: 'CASE_NOT_FOUND', message: 'Case not found' });
          const currentInstruction = await tx.event.findFirst({ where: { caseId, eventType: 'USER_INSTRUCTION' }, orderBy: { sequence: 'desc' }, select: { id: true } });
          if (currentInstruction?.id !== latest.id) throw new ConflictException({ code: 'INSTRUCTION_CHANGED', message: 'A newer instruction arrived during policy parsing; retry' });

          const version = (currentCase.currentPolicyVersion ?? 0) + 1;
          const policy = await tx.policy.create({ data: {
            caseId, version,
            maxAmount: result.policy.maxAmount,
            currency: result.policy.currency,
            allowedMerchants: result.policy.allowedMerchants,
            deadline: result.policy.deadline ? new Date(result.policy.deadline) : null,
            rawPolicy: result.policy as Prisma.InputJsonValue,
          } });
          const event = await this.events.appendInTransaction(tx, caseId, eventKey, FinancialEventInputSchema.parse({
            eventType: 'POLICY_PARSED', actorType: 'SYSTEM', source: 'INTERNAL',
            verificationLevel: 'SELF_REPORTED', occurredAt: new Date().toISOString(),
            payload: { policyId: policy.id, policy: result.policy satisfies ParsedPolicy },
          }));
          await tx.case.update({ where: { id: caseId }, data: { currentPolicyVersion: version, status: 'IN_PROGRESS' } });
          return { policy: serializePolicy(policy), event };
        }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
      } catch (error) {
        if (error instanceof Prisma.PrismaClientKnownRequestError && ['P2002', 'P2034'].includes(error.code)) continue;
        throw error;
      }
    }
    throw new ConflictException({ code: 'POLICY_CONCURRENCY_CONFLICT', message: 'Could not save policy after concurrent updates; retry request' });
  }

  async check(caseId: string, requestKey: string) {
    const eventKey = `policy-check:${requestKey}`;
    for (let attempt = 0; attempt < 5; attempt++) {
      try {
        return await this.prisma.$transaction(async (tx) => {
          const existing = await tx.event.findUnique({ where: { caseId_idempotencyKey: { caseId, idempotencyKey: eventKey } } });
          if (existing) {
            if (existing.eventType !== 'POLICY_CHECK') throw new ConflictException({ code: 'IDEMPOTENCY_CONFLICT', message: 'Request key belongs to another event' });
            return PolicyCheckPayloadSchema.parse(existing.payload);
          }
          const relatedCase = await tx.case.findUnique({ where: { id: caseId } });
          if (!relatedCase) throw new NotFoundException({ code: 'CASE_NOT_FOUND', message: 'Case not found' });
          if (relatedCase.currentPolicyVersion === null) throw new NotFoundException({ code: 'POLICY_NOT_FOUND', message: 'No active policy exists for this case' });
          const policy = await tx.policy.findUnique({ where: { caseId_version: { caseId, version: relatedCase.currentPolicyVersion } } });
          if (!policy) throw new NotFoundException({ code: 'POLICY_NOT_FOUND', message: 'No active policy exists for this case' });
          const latest = await tx.event.findFirst({ where: { caseId, eventType: 'AGENT_DECISION' }, orderBy: { sequence: 'desc' } });
          if (!latest) throw new UnprocessableEntityException({ code: 'DECISION_NOT_FOUND', message: 'No AGENT_DECISION exists for this case' });
          const decision = AgentDecisionPayloadSchema.parse(latest.payload);
          const now = new Date();
          const outcome = evaluatePolicy({
            id: policy.id, maxAmount: policy.maxAmount, currency: policy.currency,
            allowedMerchants: policy.allowedMerchants as string[], deadline: policy.deadline,
          }, decision, now);
          await this.events.appendInTransaction(tx, caseId, eventKey, FinancialEventInputSchema.parse({
            eventType: 'POLICY_CHECK', actorType: 'SYSTEM', source: 'INTERNAL',
            verificationLevel: 'SELF_REPORTED', occurredAt: now.toISOString(), payload: outcome,
          }));
          if (outcome.result === 'BLOCK') {
            await this.events.appendInTransaction(tx, caseId, `payment-blocked:${requestKey}`, FinancialEventInputSchema.parse({
              eventType: 'PAYMENT_BLOCKED', actorType: 'SYSTEM', source: 'INTERNAL',
              verificationLevel: 'SELF_REPORTED', occurredAt: now.toISOString(),
              payload: { attemptedAmount: decision.estimatedTotal, currency: decision.currency, reasonCodes: outcome.reasonCodes },
            }));
          }
          await tx.case.update({ where: { id: caseId }, data: { status: outcome.result === 'BLOCK' ? 'BLOCKED' : 'IN_PROGRESS' } });
          return outcome;
        }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
      } catch (error) {
        if (error instanceof Prisma.PrismaClientKnownRequestError && ['P2002', 'P2034'].includes(error.code)) continue;
        throw error;
      }
    }
    throw new ConflictException({ code: 'POLICY_CONCURRENCY_CONFLICT', message: 'Could not check policy after concurrent updates; retry request' });
  }
}
