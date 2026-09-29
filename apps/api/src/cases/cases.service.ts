import { Injectable, NotFoundException } from '@nestjs/common';
import type { CreateCaseInput } from '@blackbox/shared';
import { PrismaService } from '../prisma/prisma.service.js';

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
    const [currentPolicy, events, modelInvocations] = await Promise.all([
      found.currentPolicyVersion === null ? Promise.resolve(null) : this.prisma.policy.findUnique({
        where: { caseId_version: { caseId: id, version: found.currentPolicyVersion } },
      }),
      this.prisma.event.findMany({ where: { caseId: id }, orderBy: { sequence: 'asc' } }),
      this.prisma.modelInvocation.findMany({ where: { caseId: id }, orderBy: { createdAt: 'desc' } }),
    ]);
    return { ...found, currentPolicy, events, modelInvocations };
  }
}
