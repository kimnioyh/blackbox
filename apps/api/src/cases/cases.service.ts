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

  list() { return this.prisma.case.findMany({ orderBy: { createdAt: 'desc' }, take: 100 }); }

  async get(id: string) {
    const found = await this.prisma.case.findUnique({ where: { id } });
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
    return {
      ...found, currentPolicy: currentPolicy ? serializePolicy(currentPolicy) : null,
      events, modelInvocations,
      approvals: approvals.map((row) => ({ ...row, approvedAmount: row.approvedAmount?.toFixed(2) ?? null })),
      payments: payments.map((row) => ({ ...row, subtotal: row.subtotal.toFixed(2), fee: row.fee.toFixed(2), totalAmount: row.totalAmount.toFixed(2) })),
      proofs: proofs.map((row) => ({ ...row, blockNumber: row.blockNumber?.toString() ?? null })),
      audits,
    };
  }
}
