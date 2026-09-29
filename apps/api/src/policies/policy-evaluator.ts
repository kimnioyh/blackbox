import { UnprocessableEntityException } from '@nestjs/common';
import type { AgentDecisionPayload, PolicyCheckPayload } from '@blackbox/shared';
import { Prisma } from '../generated/prisma/client.js';

export type ActivePolicy = {
  id: string;
  maxAmount: Prisma.Decimal | null;
  currency: string | null;
  allowedMerchants: string[];
  deadline: Date | null;
};

/** All comparisons use decimal arithmetic and server time; the model is never consulted. */
export function evaluatePolicy(policy: ActivePolicy, decision: AgentDecisionPayload, now: Date): PolicyCheckPayload {
  const subtotal = new Prisma.Decimal(decision.subtotal);
  const fee = new Prisma.Decimal(decision.estimatedFee);
  const total = new Prisma.Decimal(decision.estimatedTotal);
  if (!subtotal.plus(fee).equals(total)) {
    throw new UnprocessableEntityException({ code: 'AMOUNT_MISMATCH', message: 'subtotal + estimatedFee must equal estimatedTotal' });
  }

  const checks: PolicyCheckPayload['checks'] = [];
  const reasonCodes: string[] = [];
  if (policy.maxAmount !== null) {
    const currencyMatches = policy.currency === null || policy.currency === decision.currency;
    const withinBudget = currencyMatches && total.lessThanOrEqualTo(policy.maxAmount);
    checks.push({ rule: 'MAX_AMOUNT', expected: `${policy.maxAmount.toFixed(2)} ${policy.currency ?? decision.currency}`, actual: `${total.toFixed(2)} ${decision.currency}`, result: withinBudget ? 'PASS' : 'FAIL' });
    if (!currencyMatches) reasonCodes.push('CURRENCY_MISMATCH');
    else if (!withinBudget) reasonCodes.push('BUDGET_EXCEEDED');
  }
  if (policy.allowedMerchants.length > 0) {
    const normalize = (value: string) => value.trim().toLocaleLowerCase('en-US');
    const permitted = policy.allowedMerchants.some((merchant) => normalize(merchant) === normalize(decision.merchant));
    checks.push({ rule: 'ALLOWED_MERCHANT', expected: policy.allowedMerchants.join(', '), actual: decision.merchant, result: permitted ? 'PASS' : 'FAIL' });
    if (!permitted) reasonCodes.push('MERCHANT_NOT_ALLOWED');
  }
  if (policy.deadline !== null) {
    const timely = now.getTime() <= policy.deadline.getTime();
    checks.push({ rule: 'DEADLINE', expected: policy.deadline.toISOString(), actual: now.toISOString(), result: timely ? 'PASS' : 'FAIL' });
    if (!timely) reasonCodes.push('DEADLINE_EXPIRED');
  }
  return { policyId: policy.id, result: reasonCodes.length === 0 ? 'ALLOW' : 'BLOCK', checks, reasonCodes };
}
