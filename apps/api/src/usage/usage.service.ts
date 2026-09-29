import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';

@Injectable()
export class UsageService {
  constructor(private readonly prisma: PrismaService) {}

  async summary(caseId?: string) {
    const rows = await this.prisma.modelInvocation.groupBy({
      by: ['flowType'], where: caseId ? { caseId } : undefined,
      _count: { _all: true }, _sum: { inputTokens: true, outputTokens: true, totalTokens: true },
    });
    const bucket = (flowType: 'POLICY_EXTRACTION' | 'AUDIT_EXPLANATION') => {
      const row = rows.find((item) => item.flowType === flowType);
      return { callCount: row?._count._all ?? 0, inputTokens: row?._sum.inputTokens ?? 0,
        outputTokens: row?._sum.outputTokens ?? 0, totalTokens: row?._sum.totalTokens ?? 0 };
    };
    const policyExtraction = bucket('POLICY_EXTRACTION');
    const auditExplanation = bucket('AUDIT_EXPLANATION');
    return { policyExtraction, auditExplanation, total: {
      callCount: policyExtraction.callCount + auditExplanation.callCount,
      inputTokens: policyExtraction.inputTokens + auditExplanation.inputTokens,
      outputTokens: policyExtraction.outputTokens + auditExplanation.outputTokens,
      totalTokens: policyExtraction.totalTokens + auditExplanation.totalTokens,
    } };
  }
}
