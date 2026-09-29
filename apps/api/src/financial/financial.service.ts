import { ConflictException, Injectable, NotFoundException, UnprocessableEntityException } from '@nestjs/common';
import { canonicalJson } from '@blackbox/blockchain';
import {
  FinancialEventInputSchema,
  type CreateApprovalInput, type CreateDisputeInput, type CreatePaymentInput,
} from '@blackbox/shared';
import { Prisma } from '../generated/prisma/client.js';
import { EventsService } from '../events/events.service.js';
import { PrismaService } from '../prisma/prisma.service.js';

const money = (value: Prisma.Decimal | null) => value?.toFixed(2) ?? null;

function serializeApproval(row: {
  id: string; caseId: string; decision: string; actorUserId: string | null;
  externalActorId: string | null; approvedAmount: Prisma.Decimal | null;
  currency: string | null; createdAt: Date;
}) {
  return { ...row, approvedAmount: money(row.approvedAmount) };
}

function serializePayment(row: {
  id: string; caseId: string; externalPaymentId: string | null; merchant: string;
  subtotal: Prisma.Decimal; fee: Prisma.Decimal; totalAmount: Prisma.Decimal;
  currency: string; status: string; executedAt: Date | null; createdAt: Date;
}) {
  return { ...row, subtotal: money(row.subtotal), fee: money(row.fee), totalAmount: money(row.totalAmount) };
}

@Injectable()
export class FinancialService {
  constructor(private readonly prisma: PrismaService, private readonly events: EventsService) {}

  private async transaction<T>(work: (tx: Prisma.TransactionClient) => Promise<T>): Promise<T> {
    for (let attempt = 0; attempt < 5; attempt++) {
      try {
        return await this.prisma.$transaction(work, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
      } catch (error) {
        if (error instanceof Prisma.PrismaClientKnownRequestError && ['P2002', 'P2034'].includes(error.code)) continue;
        throw error;
      }
    }
    throw new ConflictException({ code: 'FINANCIAL_CONCURRENCY_CONFLICT', message: 'Could not record the request after concurrent updates; retry' });
  }

  async approve(caseId: string, key: string, input: CreateApprovalInput) {
    const eventKey = `approval:${key}`;
    return this.transaction(async (tx) => {
      const existing = await tx.approval.findUnique({ where: { caseId_idempotencyKey: { caseId, idempotencyKey: eventKey } } });
      if (existing) {
        const original = { decision: existing.decision, approvedAmount: money(existing.approvedAmount), currency: existing.currency, actorUserId: existing.actorUserId, externalActorId: existing.externalActorId };
        const requested = { decision: input.decision, approvedAmount: input.approvedAmount ? new Prisma.Decimal(input.approvedAmount).toFixed(2) : null, currency: input.currency ?? null, actorUserId: input.actorUserId ?? null, externalActorId: input.externalActorId ?? null };
        if (canonicalJson(original) !== canonicalJson(requested)) throw new ConflictException({ code: 'IDEMPOTENCY_CONFLICT', message: 'Request key was already used with different approval data' });
        const event = await tx.event.findUnique({ where: { caseId_idempotencyKey: { caseId, idempotencyKey: eventKey } } });
        return { approval: serializeApproval(existing), event };
      }
      const relatedCase = await tx.case.findUnique({ where: { id: caseId }, select: { id: true } });
      if (!relatedCase) throw new NotFoundException({ code: 'CASE_NOT_FOUND', message: 'Case not found' });
      const now = new Date();
      const approval = await tx.approval.create({ data: {
        caseId, idempotencyKey: eventKey, decision: input.decision,
        actorUserId: input.actorUserId ?? null, externalActorId: input.externalActorId ?? null,
        approvedAmount: input.approvedAmount ?? null, currency: input.currency ?? null,
      } });
      const event = await this.events.appendInTransaction(tx, caseId, eventKey, FinancialEventInputSchema.parse({
        eventType: 'HUMAN_APPROVAL', actorType: 'USER', actorId: input.actorUserId ?? input.externalActorId ?? null,
        source: 'REST_API', verificationLevel: 'SELF_REPORTED', occurredAt: now.toISOString(),
        payload: { approvalId: approval.id, decision: approval.decision,
          ...(approval.approvedAmount ? { approvedAmount: approval.approvedAmount.toFixed(2) } : {}),
          ...(approval.currency ? { currency: approval.currency } : {}) },
      }));
      if (input.decision === 'REJECTED') await tx.case.update({ where: { id: caseId }, data: { status: 'BLOCKED' } });
      return { approval: serializeApproval(approval), event };
    });
  }

  async pay(caseId: string, key: string, input: CreatePaymentInput) {
    const eventKey = `payment:${key}`;
    const subtotal = new Prisma.Decimal(input.subtotal);
    const fee = new Prisma.Decimal(input.fee);
    const total = new Prisma.Decimal(input.totalAmount);
    if (!subtotal.plus(fee).equals(total)) throw new UnprocessableEntityException({ code: 'AMOUNT_MISMATCH', message: 'subtotal + fee must equal totalAmount' });
    return this.transaction(async (tx) => {
      const existing = await tx.payment.findUnique({ where: { caseId_idempotencyKey: { caseId, idempotencyKey: eventKey } } });
      if (existing) {
        const original = { externalPaymentId: existing.externalPaymentId, merchant: existing.merchant, subtotal: existing.subtotal.toFixed(2), fee: existing.fee.toFixed(2), totalAmount: existing.totalAmount.toFixed(2), currency: existing.currency, status: existing.status, executedAt: existing.executedAt?.toISOString() ?? null };
        const requested = { externalPaymentId: input.externalPaymentId ?? null, merchant: input.merchant, subtotal: subtotal.toFixed(2), fee: fee.toFixed(2), totalAmount: total.toFixed(2), currency: input.currency, status: input.status, executedAt: input.executedAt ? new Date(input.executedAt).toISOString() : null };
        if (canonicalJson(original) !== canonicalJson(requested)) throw new ConflictException({ code: 'IDEMPOTENCY_CONFLICT', message: 'Request key was already used with different payment data' });
        const event = input.status === 'SUCCESS' ? await tx.event.findUnique({ where: { caseId_idempotencyKey: { caseId, idempotencyKey: eventKey } } }) : null;
        return { payment: serializePayment(existing), event };
      }
      const relatedCase = await tx.case.findUnique({ where: { id: caseId }, select: { id: true } });
      if (!relatedCase) throw new NotFoundException({ code: 'CASE_NOT_FOUND', message: 'Case not found' });
      const payment = await tx.payment.create({ data: {
        caseId, idempotencyKey: eventKey, externalPaymentId: input.externalPaymentId ?? null,
        merchant: input.merchant, subtotal, fee, totalAmount: total,
        currency: input.currency, status: input.status,
        executedAt: input.executedAt ? new Date(input.executedAt) : null,
      } });
      const event = input.status === 'SUCCESS' ? await this.events.appendInTransaction(tx, caseId, eventKey, FinancialEventInputSchema.parse({
        eventType: 'PAYMENT_EXECUTED', actorType: 'EXTERNAL_SERVICE', source: 'PAYMENT_PROVIDER',
        verificationLevel: 'SELF_REPORTED', occurredAt: (payment.executedAt ?? payment.createdAt).toISOString(),
        payload: { paymentId: payment.id, merchant: payment.merchant, subtotal: payment.subtotal.toFixed(2),
          fee: payment.fee.toFixed(2), totalAmount: payment.totalAmount.toFixed(2), currency: payment.currency,
          status: payment.status, ...(payment.externalPaymentId ? { externalPaymentId: payment.externalPaymentId } : {}) },
      })) : null;
      return { payment: serializePayment(payment), event };
    });
  }

  async dispute(caseId: string, key: string, input: CreateDisputeInput) {
    const eventKey = `dispute:${key}`;
    return this.transaction(async (tx) => {
      const existing = await tx.event.findUnique({ where: { caseId_idempotencyKey: { caseId, idempotencyKey: eventKey } } });
      const payload = { reason: input.reason, ...(input.disputedPaymentId ? { disputedPaymentId: input.disputedPaymentId } : {}), requestedBy: 'USER' as const };
      if (existing) {
        if (existing.eventType !== 'DISPUTE_CREATED' || canonicalJson(existing.payload) !== canonicalJson(payload)) throw new ConflictException({ code: 'IDEMPOTENCY_CONFLICT', message: 'Request key was already used with different dispute data' });
        return { event: existing, status: 'DISPUTED' as const };
      }
      const relatedCase = await tx.case.findUnique({ where: { id: caseId }, select: { id: true } });
      if (!relatedCase) throw new NotFoundException({ code: 'CASE_NOT_FOUND', message: 'Case not found' });
      if (input.disputedPaymentId) {
        const payment = await tx.payment.findFirst({ where: { id: input.disputedPaymentId, caseId }, select: { id: true } });
        if (!payment) throw new NotFoundException({ code: 'PAYMENT_NOT_FOUND', message: 'Disputed payment not found in this case' });
      }
      const event = await this.events.appendInTransaction(tx, caseId, eventKey, FinancialEventInputSchema.parse({
        eventType: 'DISPUTE_CREATED', actorType: 'USER', source: 'REST_API',
        verificationLevel: 'SELF_REPORTED', occurredAt: new Date().toISOString(), payload,
      }));
      await tx.case.update({ where: { id: caseId }, data: { status: 'DISPUTED' } });
      return { event, status: 'DISPUTED' as const };
    });
  }
}
