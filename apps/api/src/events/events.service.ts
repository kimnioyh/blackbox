import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { hashCanonical, canonicalJson } from '@blackbox/blockchain';
import type { AppendEventRequest } from '@blackbox/shared';
import { randomUUID } from 'node:crypto';
import { Prisma } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';

function requestFields(input: AppendEventRequest) {
  return {
    eventType: input.eventType,
    actorType: input.actorType,
    actorId: input.actorId ?? null,
    source: input.source,
    verificationLevel: input.verificationLevel,
    occurredAt: new Date(input.occurredAt).toISOString(),
    payload: input.payload,
  };
}

@Injectable()
export class EventsService {
  constructor(private readonly prisma: PrismaService) {}

  async append(caseId: string, idempotencyKey: string, input: AppendEventRequest) {
    for (let attempt = 0; attempt < 5; attempt++) {
      try {
        return await this.prisma.$transaction(async (tx) => {
          const relatedCase = await tx.case.findUnique({ where: { id: caseId }, select: { id: true } });
          if (!relatedCase) throw new NotFoundException({ code: 'CASE_NOT_FOUND', message: 'Case not found' });

          const existing = await tx.event.findUnique({ where: { caseId_idempotencyKey: { caseId, idempotencyKey } } });
          if (existing) {
            const original = {
              eventType: existing.eventType, actorType: existing.actorType, actorId: existing.actorId,
              source: existing.source, verificationLevel: existing.verificationLevel,
              occurredAt: existing.occurredAt.toISOString(), payload: existing.payload,
            };
            if (canonicalJson(original) !== canonicalJson(requestFields(input))) {
              throw new ConflictException({ code: 'IDEMPOTENCY_CONFLICT', message: 'Idempotency key was already used with different event data' });
            }
            return existing;
          }

          const last = await tx.event.findFirst({ where: { caseId }, orderBy: { sequence: 'desc' }, select: { sequence: true, eventHash: true } });
          const id = randomUUID();
          const sequence = (last?.sequence ?? 0) + 1;
          const previousEventHash = last?.eventHash ?? null;
          const receivedAt = new Date();
          const fields = requestFields(input);
          const eventHash = hashCanonical({
            id, caseId, sequence, idempotencyKey, ...fields,
            previousEventHash, receivedAt: receivedAt.toISOString(),
          });
          return tx.event.create({ data: {
            id, caseId, idempotencyKey, sequence,
            eventType: fields.eventType, actorType: fields.actorType, actorId: fields.actorId,
            source: fields.source, verificationLevel: fields.verificationLevel,
            payload: fields.payload as Prisma.InputJsonValue,
            previousEventHash, eventHash,
            occurredAt: new Date(fields.occurredAt), receivedAt,
          } });
        }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
      } catch (error) {
        if (error instanceof Prisma.PrismaClientKnownRequestError && ['P2002', 'P2034'].includes(error.code)) continue;
        throw error;
      }
    }
    throw new ConflictException({ code: 'EVENT_CONCURRENCY_CONFLICT', message: 'Could not append event after concurrent updates; retry request' });
  }

  async list(caseId: string) {
    const relatedCase = await this.prisma.case.findUnique({ where: { id: caseId }, select: { id: true } });
    if (!relatedCase) throw new NotFoundException({ code: 'CASE_NOT_FOUND', message: 'Case not found' });
    return this.prisma.event.findMany({ where: { caseId }, orderBy: { sequence: 'asc' } });
  }
}
