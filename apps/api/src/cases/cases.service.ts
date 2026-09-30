import { Injectable, NotFoundException } from '@nestjs/common';
import type { CreateCaseInput } from '@blackbox/shared';
import { PrismaService } from '../prisma/prisma.service.js';
import { serializePolicy } from '../common/serialize-policy.js';

@Injectable()
export class CasesService {
  constructor(private readonly prisma: PrismaService) {}

  create(input: CreateCaseInput) {
    return this.prisma.case.create({ data: {
      title: input.title,
      organizationId: input.organizationId ?? null,
      ownerUserId: input.ownerUserId ?? null,
      agentId: input.agentId ?? null,
      externalUserId: input.externalUserId ?? null,
      externalCaseId: input.externalCaseId ?? null,
    } });
  }

  async list() {
    const cases = await this.prisma.case.findMany({
      orderBy: { createdAt: 'desc' },
      include: {
        agent: { select: { name: true } },
        payments: { orderBy: { createdAt: 'desc' }, take: 1, select: { totalAmount: true, currency: true } },
        events: { where: { eventType: 'AGENT_DECISION' }, orderBy: { sequence: 'desc' }, take: 1, select: { payload: true } },
        blockchainProofs: { take: 1, select: { id: true } },
        auditResults: { orderBy: { createdAt: 'desc' }, take: 1, select: { verdict: true } },
      },
    });
    return cases.map(({ agent, payments, events, blockchainProofs, auditResults, ...relatedCase }) => {
      const decision = events[0]?.payload;
      const payload = decision && typeof decision === 'object' && !Array.isArray(decision) ? decision : null;
      return {
        ...relatedCase,
        agentName: agent?.name ?? null,
        hasAgentDecision: events.length > 0,
        amount: payments[0]?.totalAmount.toFixed(2) ?? (typeof payload?.estimatedTotal === 'string' ? payload.estimatedTotal : null),
        currency: payments[0]?.currency ?? (typeof payload?.currency === 'string' ? payload.currency : null),
        hasProof: blockchainProofs.length > 0,
        latestAuditVerdict: auditResults[0]?.verdict ?? null,
      };
    });
  }

  async get(id: string) {
    const found = await this.prisma.case.findUnique({ where: { id }, include: { agent: { select: { name: true } } } });
    if (!found) throw new NotFoundException({ code: 'CASE_NOT_FOUND', message: 'Case not found' });
    const [currentPolicy, events, modelInvocations, approvals, payments, proofs, audits] = await Promise.all([
      found.currentPolicyVersion === null ? Promise.resolve(null) : this.prisma.policy.findUnique({
        where: { caseId_version: { caseId: id, version: found.currentPolicyVersion } },
      }),
      this.prisma.event.findMany({ where: { caseId: id }, orderBy: { sequence: 'asc' } }),
      this.prisma.modelInvocation.findMany({ where: { caseId: id }, orderBy: { createdAt: 'desc' } }),
      this.prisma.approval.findMany({ where: { caseId: id }, orderBy: { createdAt: 'desc' } }),
      this.prisma.payment.findMany({ where: { caseId: id }, orderBy: { createdAt: 'desc' } }),
      this.prisma.blockchainProof.findMany({ where: { caseId: id }, orderBy: { createdAt: 'desc' } }),
      this.prisma.auditResult.findMany({ where: { caseId: id }, orderBy: { createdAt: 'desc' } }),
    ]);
    const { agent, ...relatedCase } = found;
    return {
      ...relatedCase, agentName: agent?.name ?? null, currentPolicy: currentPolicy ? serializePolicy(currentPolicy) : null,
      events, modelInvocations,
      approvals: approvals.map((row) => ({ ...row, approvedAmount: row.approvedAmount?.toFixed(2) ?? null })),
      payments: payments.map((row) => ({ ...row, subtotal: row.subtotal.toFixed(2), fee: row.fee.toFixed(2), totalAmount: row.totalAmount.toFixed(2) })),
      proofs: proofs.map((row) => ({ ...row, blockNumber: row.blockNumber?.toString() ?? null })),
      audits,
    };
  }
}
