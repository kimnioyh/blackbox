import { z } from 'zod';

export const CaseStatusSchema = z.enum(['CREATED', 'IN_PROGRESS', 'VERIFIED', 'BLOCKED', 'DISPUTED', 'CLOSED']);
export const OrganizationRoleSchema = z.enum(['OWNER', 'ADMIN', 'MEMBER', 'VIEWER']);
export const ApprovalDecisionSchema = z.enum(['APPROVED', 'REJECTED']);
export const PaymentStatusSchema = z.enum(['PENDING', 'SUCCESS', 'FAILED', 'BLOCKED']);
export const AuditVerdictSchema = z.enum(['COMPLIANT', 'VIOLATION', 'INCONCLUSIVE']);
export const ProofStatusSchema = z.enum(['PENDING', 'CONFIRMED', 'FAILED']);
export const FlowTypeSchema = z.enum(['POLICY_EXTRACTION', 'AUDIT_EXPLANATION']);
export const EventTypeSchema = z.enum([
  'USER_INSTRUCTION', 'POLICY_PARSED', 'AGENT_DECISION', 'POLICY_CHECK',
  'HUMAN_APPROVAL', 'PAYMENT_EXECUTED', 'PAYMENT_BLOCKED', 'DISPUTE_CREATED',
  'AUDIT_RESULT', 'PROOF_RECORDED',
]);
export const ActorTypeSchema = z.enum(['USER', 'AGENT', 'SYSTEM', 'EXTERNAL_SERVICE']);
export const EventSourceSchema = z.enum(['REST_API', 'MCP', 'INTERNAL', 'PAYMENT_PROVIDER', 'BLOCKCHAIN']);
export const VerificationLevelSchema = z.enum(['SELF_REPORTED', 'SIGNED', 'EXTERNALLY_VERIFIED', 'ON_CHAIN']);
export const PolicyRuleSchema = z.enum(['MAX_AMOUNT', 'ALLOWED_MERCHANT', 'DEADLINE']);

export const MoneyAmountSchema = z.string().regex(/^(0|[1-9]\d*)(\.\d{1,2})?$/, 'Use a non-negative decimal string with at most two fractional digits');
export const CurrencySchema = z.string().regex(/^[A-Z]{3}$/, 'Use a three-letter uppercase currency');
export const DateTimeSchema = z.iso.datetime({ offset: true });
export const ParsedPolicySchema = z.object({
  maxAmount: MoneyAmountSchema.nullable(),
  currency: CurrencySchema.nullable(),
  allowedMerchants: z.array(z.string().min(1)),
  deadline: DateTimeSchema.nullable(),
}).strict();
export const AuditOutputSchema = z.object({
  verdict: AuditVerdictSchema,
  summary: z.string().min(1),
  violations: z.array(z.object({ rule: PolicyRuleSchema, description: z.string().min(1) }).strict()),
}).strict();

export const CreateCaseSchema = z.object({
  title: z.string().trim().min(1).max(255),
  organizationId: z.string().min(1).nullable().optional(),
  ownerUserId: z.string().min(1).nullable().optional(),
  agentId: z.string().min(1).nullable().optional(),
  externalUserId: z.string().min(1).nullable().optional(),
  externalCaseId: z.string().min(1).nullable().optional(),
}).strict();

const baseEvent = {
  idempotencyKey: z.string().trim().min(1).max(255).optional(),
  actorType: ActorTypeSchema,
  actorId: z.string().min(1).nullable().optional(),
  source: EventSourceSchema,
  verificationLevel: VerificationLevelSchema,
  occurredAt: DateTimeSchema,
};
const instruction = z.object({ text: z.string().min(1), locale: z.string().min(2).optional() }).strict();
const policyParsed = z.object({ policyId: z.string().min(1), policy: ParsedPolicySchema }).strict();
const agentDecision = z.object({
  action: z.enum(['PURCHASE', 'PAYMENT', 'TRANSFER']), merchant: z.string().min(1),
  item: z.object({ name: z.string().min(1) }).strict(),
  subtotal: MoneyAmountSchema, estimatedFee: MoneyAmountSchema, estimatedTotal: MoneyAmountSchema,
  currency: CurrencySchema, reasonSummary: z.string().optional(),
}).strict();
const policyCheck = z.object({
  policyId: z.string().min(1), result: z.enum(['ALLOW', 'BLOCK']),
  checks: z.array(z.object({ rule: PolicyRuleSchema, expected: z.string(), actual: z.string(), result: z.enum(['PASS', 'FAIL']) }).strict()),
  reasonCodes: z.array(z.string()),
}).strict();
const approval = z.object({ decision: ApprovalDecisionSchema, approvedAmount: MoneyAmountSchema.optional(), currency: CurrencySchema.optional() }).strict();
const payment = z.object({
  paymentId: z.string().min(1), merchant: z.string().min(1), subtotal: MoneyAmountSchema,
  fee: MoneyAmountSchema, totalAmount: MoneyAmountSchema, currency: CurrencySchema,
  status: PaymentStatusSchema, externalPaymentId: z.string().optional(),
}).strict();
const paymentBlocked = z.object({ attemptedAmount: MoneyAmountSchema, currency: CurrencySchema, reasonCodes: z.array(z.string()) }).strict();
const dispute = z.object({ reason: z.string().min(1), disputedPaymentId: z.string().min(1), requestedBy: z.literal('USER') }).strict();
const audit = z.object({
  auditId: z.string().min(1), verdict: AuditVerdictSchema, summary: z.string().min(1),
  violations: z.array(z.object({ rule: PolicyRuleSchema, description: z.string().min(1) }).strict()),
}).strict();
const proof = z.object({
  proofId: z.string().min(1), chainId: z.number().int().positive(),
  recordHash: z.string().regex(/^0x[0-9a-fA-F]{64}$/), txHash: z.string().regex(/^0x[0-9a-fA-F]{64}$/),
  blockNumber: z.string().regex(/^\d+$/),
}).strict();

export const FinancialEventInputSchema = z.discriminatedUnion('eventType', [
  z.object({ ...baseEvent, eventType: z.literal('USER_INSTRUCTION'), payload: instruction }).strict(),
  z.object({ ...baseEvent, eventType: z.literal('POLICY_PARSED'), payload: policyParsed }).strict(),
  z.object({ ...baseEvent, eventType: z.literal('AGENT_DECISION'), payload: agentDecision }).strict(),
  z.object({ ...baseEvent, eventType: z.literal('POLICY_CHECK'), payload: policyCheck }).strict(),
  z.object({ ...baseEvent, eventType: z.literal('HUMAN_APPROVAL'), payload: approval }).strict(),
  z.object({ ...baseEvent, eventType: z.literal('PAYMENT_EXECUTED'), payload: payment }).strict(),
  z.object({ ...baseEvent, eventType: z.literal('PAYMENT_BLOCKED'), payload: paymentBlocked }).strict(),
  z.object({ ...baseEvent, eventType: z.literal('DISPUTE_CREATED'), payload: dispute }).strict(),
  z.object({ ...baseEvent, eventType: z.literal('AUDIT_RESULT'), payload: audit }).strict(),
  z.object({ ...baseEvent, eventType: z.literal('PROOF_RECORDED'), payload: proof }).strict(),
]);
export const AppendEventRequestSchema = FinancialEventInputSchema;

export type CreateCaseInput = z.infer<typeof CreateCaseSchema>;
export type FinancialEventInput = z.infer<typeof FinancialEventInputSchema>;
export type AppendEventRequest = z.infer<typeof AppendEventRequestSchema>;
export type ParsedPolicy = z.infer<typeof ParsedPolicySchema>;
export type AuditOutput = z.infer<typeof AuditOutputSchema>;
export type CaseStatus = z.infer<typeof CaseStatusSchema>;
