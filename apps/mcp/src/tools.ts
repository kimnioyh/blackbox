import { createHash, randomUUID } from 'node:crypto';
import { McpServer } from '@modelcontextprotocol/server';
import { CurrencySchema, MoneyAmountSchema } from '@blackbox/shared';
import * as z from 'zod/v4';
import { RestApiError, RestClient, type CaseListRecord, type CaseRecord } from './rest-client.js';

const key = z.string().trim().min(1).max(120);
const caseId = z.string().min(1);
const amount = MoneyAmountSchema;
const currency = CurrencySchema;

function casePath(id: string, suffix = '') { return `/cases/${encodeURIComponent(id)}${suffix}`; }
function result(data: unknown) { return { content: [{ type: 'text' as const, text: JSON.stringify(data) }] }; }

async function tool<T>(work: () => Promise<T>) {
  try { return result(await work()); }
  catch (error) {
    const message = error instanceof RestApiError
      ? `${error.code} (${error.status}): ${error.message}`
      : error instanceof Error ? error.message : 'Unknown MCP adapter error';
    return { content: [{ type: 'text' as const, text: message }], isError: true };
  }
}

export function createFinancialMcpServer(rest: RestClient) {
  const server = new McpServer({ name: 'agent-financial-blackbox', version: '0.1.0' });

  server.registerTool('start_financial_case', {
    description: 'Create or resume a financial Case, record the user instruction, and parse its policy through the existing REST API.',
    inputSchema: z.object({ instruction: z.string().trim().min(1), title: z.string().trim().min(1).max(255).optional(),
      locale: z.string().min(2).optional(), idempotencyKey: key }),
  }, async ({ instruction, title, locale, idempotencyKey }) => tool(async () => {
    const externalCaseId = `mcp:${idempotencyKey}`;
    const cases = await rest.get<CaseListRecord[]>('/cases');
    const prior = cases.find((item) => item.externalCaseId === externalCaseId);
    const created = prior ?? await rest.post<{ id: string }>('/cases', {
      title: title ?? instruction.slice(0, 120), externalCaseId,
    });
    const path = casePath(created.id);
    let recorded: CaseRecord['events'][number] | undefined;
    if (prior) {
      const existing = await rest.get<CaseRecord>(path);
      recorded = existing.events.find((event) => event.idempotencyKey === `mcp-start-instruction:${idempotencyKey}`);
      if (recorded && (recorded.payload.text !== instruction || (recorded.payload.locale ?? 'en') !== (locale ?? 'en'))) {
        throw new Error('Idempotency key was already used for a different instruction');
      }
    }
    await rest.post(`${path}/events`, {
      eventType: 'USER_INSTRUCTION', actorType: 'USER', source: 'MCP',
      verificationLevel: 'SELF_REPORTED', occurredAt: recorded?.occurredAt ?? new Date().toISOString(),
      payload: { text: instruction, locale: locale ?? 'en' },
    }, `mcp-start-instruction:${idempotencyKey}`);
    const parsed = await rest.post<{ policy: unknown }>(`${path}/policy/parse`, {}, `mcp-start-parse:${idempotencyKey}`);
    const latest = await rest.get<CaseRecord>(path);
    return { caseId: created.id, status: latest.status, policy: parsed.policy };
  }));

  server.registerTool('propose_financial_action', {
    description: 'Record an agent proposal and run the deterministic policy check. Do not proceed with a financial action when result is BLOCK.',
    inputSchema: z.object({ caseId, action: z.enum(['PURCHASE', 'PAYMENT', 'TRANSFER']),
      merchant: z.string().min(1).optional(), item: z.object({ name: z.string().min(1) }).optional(),
      subtotal: amount, fee: amount, totalAmount: amount, currency,
      reasonSummary: z.string().optional(), idempotencyKey: key }),
  }, async ({ caseId: id, action, merchant, item, subtotal, fee, totalAmount, currency: unit, reasonSummary, idempotencyKey }) => tool(async () => {
    const path = casePath(id);
    const existing = await rest.get<CaseRecord>(path);
    const recorded = existing.events.find((event) => event.idempotencyKey === `mcp-decision:${idempotencyKey}`);
    await rest.post(`${path}/events`, {
      eventType: 'AGENT_DECISION', actorType: 'AGENT', source: 'MCP',
      verificationLevel: 'SELF_REPORTED', occurredAt: recorded?.occurredAt ?? new Date().toISOString(),
      payload: { action, merchant: merchant ?? 'UNSPECIFIED', item: item ?? { name: action },
        subtotal, estimatedFee: fee, estimatedTotal: totalAmount, currency: unit,
        ...(reasonSummary ? { reasonSummary } : {}) },
    }, `mcp-decision:${idempotencyKey}`);
    const check = await rest.post<{ result: 'ALLOW' | 'BLOCK'; checks: unknown[]; reasonCodes: string[] }>(
      `${path}/policy/check`, {}, `mcp-check:${idempotencyKey}`);
    return { result: check.result, checks: check.checks, reasonCodes: check.reasonCodes,
      requiresHumanApproval: check.result === 'ALLOW' };
  }));

  server.registerTool('record_human_approval', {
    description: 'Record an explicit human approval or rejection. Only call this after the human explicitly approves or rejects. Never infer approval.',
    inputSchema: z.object({ caseId, decision: z.enum(['APPROVED', 'REJECTED']),
      approvedAmount: amount.optional(), currency: currency.optional(), idempotencyKey: key }),
  }, async ({ caseId: id, decision, approvedAmount, currency: unit, idempotencyKey }) => tool(async () => {
    const response = await rest.post<{ approval: unknown }>(casePath(id, '/approvals'), {
      decision, ...(approvedAmount ? { approvedAmount } : {}), ...(unit ? { currency: unit } : {}),
    }, `mcp-approval:${idempotencyKey}`);
    return { approval: response.approval };
  }));

  server.registerTool('record_payment_result', {
    description: 'Record an externally executed payment result; does not execute a payment. A SUCCESS is then committed with the existing Sepolia proof endpoint.',
    inputSchema: z.object({ caseId, status: z.enum(['SUCCESS', 'FAILED']), merchant: z.string().min(1),
      subtotal: amount, fee: amount, totalAmount: amount, currency,
      externalPaymentId: z.string().min(1).optional(), idempotencyKey: key }),
  }, async ({ caseId: id, status, merchant, subtotal, fee, totalAmount, currency: unit, externalPaymentId, idempotencyKey }) => tool(async () => {
    const path = casePath(id);
    const response = await rest.post<{ payment: unknown }>(`${path}/payments`, {
      status, merchant, subtotal, fee, totalAmount, currency: unit,
      ...(externalPaymentId ? { externalPaymentId } : {}),
    }, `mcp-payment:${idempotencyKey}`);
    if (status !== 'SUCCESS') return { payment: response.payment, proof: null };
    try {
      const proof = await rest.post<unknown>(`${path}/proofs`, {}, `mcp-proof:${idempotencyKey}`);
      return { payment: response.payment, proof };
    } catch (error) {
      // The external payment has already been recorded. Report that partial outcome explicitly.
      return { payment: response.payment, proof: null,
        proofError: error instanceof RestApiError ? error.code : error instanceof Error ? error.message : 'Proof request failed' };
    }
  }));

  server.registerTool('audit_financial_case', {
    description: 'Optionally record a dispute, then run the existing Case audit and return its verdict and proof verification result.',
    inputSchema: z.object({ caseId, disputeReason: z.string().trim().min(1).optional() }),
  }, async ({ caseId: id, disputeReason }) => tool(async () => {
    const path = casePath(id);
    if (disputeReason) {
      const digest = createHash('sha256').update(`${id}\0${disputeReason}`).digest('hex').slice(0, 48);
      await rest.post(`${path}/disputes`, { reason: disputeReason }, `mcp-dispute:${digest}`);
    }
    const response = await rest.post<{ audit: { verdict: string; summary: string; violations: unknown[] }; proofVerified: boolean | null }>(
      `${path}/audits`, {}, `mcp-audit:${randomUUID()}`);
    return { verdict: response.audit.verdict, summary: response.audit.summary,
      violations: response.audit.violations, proofVerified: response.proofVerified };
  }));

  server.registerTool('get_financial_case', {
    description: 'Read a compact Case summary and recorded timeline. This tool is read-only.',
    inputSchema: z.object({ caseId }),
  }, async ({ caseId: id }) => tool(async () => {
    const relatedCase = await rest.get<CaseRecord>(casePath(id));
    let proofVerified: boolean | null = null;
    if (relatedCase.proofs.length) {
      const verified = await rest.get<{ verified: boolean }>(casePath(id, '/proofs/verify'));
      proofVerified = verified.verified;
    }
    return {
      caseId: relatedCase.id, title: relatedCase.title, status: relatedCase.status,
      policy: relatedCase.currentPolicy, approval: relatedCase.approvals[0] ?? null,
      payment: relatedCase.payments[0] ?? null,
      proof: relatedCase.proofs[0] ? { ...relatedCase.proofs[0], verified: proofVerified } : null,
      latestAudit: relatedCase.audits[0] ?? null,
      timeline: relatedCase.events.map((event) => ({ sequence: event.sequence,
        eventType: event.eventType, occurredAt: event.occurredAt,
        outcome: event.payload.result ?? event.payload.verdict ?? event.payload.status ?? null })),
    };
  }));

  return server;
}
