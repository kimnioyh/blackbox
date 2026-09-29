import { BadGatewayException, Injectable, ServiceUnavailableException } from '@nestjs/common';
import { AuditOutputSchema, ParsedPolicySchema, type AuditOutput, type CaseAuditInput, type ParsedPolicy } from '@blackbox/shared';
import { z } from 'zod';

const ChatCompletionSchema = z.object({
  model: z.string(),
  choices: z.array(z.object({
    message: z.object({ content: z.string().nullable() }),
    finish_reason: z.string().nullable(),
  })).min(1),
  usage: z.object({
    prompt_tokens: z.number().int().nonnegative().optional(),
    completion_tokens: z.number().int().nonnegative().optional(),
    total_tokens: z.number().int().nonnegative().optional(),
  }).optional(),
});

export type KilnPolicyResult = {
  policy: ParsedPolicy;
  model: string;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  latencyMs: number;
};
export type KilnAuditResult = {
  audit: AuditOutput;
  model: string;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  latencyMs: number;
};
export class KilnAuditResponseError extends BadGatewayException {
  constructor(code: string, message: string, public readonly usage: Omit<KilnAuditResult, 'audit'>) {
    super({ code, message });
  }
}

/** Bricksum Kiln's documented OpenAI-shaped Chat Completions endpoint. */
@Injectable()
export class KilnService {
  async explainAudit(input: CaseAuditInput): Promise<KilnAuditResult> {
    const key = process.env.KILN_API_KEY;
    if (!key) throw new ServiceUnavailableException({ code: 'KILN_NOT_CONFIGURED', message: 'KILN_API_KEY is not configured' });
    const baseUrl = (process.env.KILN_API_BASE_URL ?? 'https://api.bricksum.com/v1').replace(/\/$/, '');
    const model = process.env.KILN_MODEL ?? 'qwen3-32b';
    const started = Date.now();
    let response: Response;
    try {
      response = await fetch(`${baseUrl}/chat/completions`, {
        method: 'POST', headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ model, messages: [
          { role: 'system', content: 'You explain a financial audit from server-calculated facts. Return exactly one JSON object with verdict (COMPLIANT, VIOLATION, or INCONCLUSIVE), summary (one clear sentence), and violations (array of {rule, description}; rule is MAX_AMOUNT, ALLOWED_MERCHANT, or DEADLINE). The verdict MUST equal expectedVerdict. Violations MUST correspond exactly to paymentChecks marked FAIL; use an empty array otherwise. Mention exact allowed and actual total amounts for a MAX_AMOUNT failure. If evidence is insufficient, name only fields listed in missingEvidence. Do not recalculate policy checks, authorize spending, invent facts, include markdown, or provide chain-of-thought. A proof verifies evidence integrity, not financial correctness.' },
          { role: 'user', content: JSON.stringify(input) },
        ], max_tokens: 1000, temperature: 0 }), signal: AbortSignal.timeout(90_000),
      });
    } catch {
      throw new BadGatewayException({ code: 'KILN_UNREACHABLE', message: 'Kiln audit request failed or timed out' });
    }
    if (!response.ok) throw new BadGatewayException({ code: 'KILN_REQUEST_FAILED', message: `Kiln returned HTTP ${response.status}` });
    let body: unknown;
    try { body = await response.json(); }
    catch { throw new BadGatewayException({ code: 'KILN_INVALID_RESPONSE', message: 'Kiln returned invalid JSON' }); }
    const completion = ChatCompletionSchema.safeParse(body);
    if (!completion.success) throw new BadGatewayException({ code: 'KILN_INVALID_RESPONSE', message: 'Kiln response shape was invalid' });
    const tokenUsage = completion.data.usage;
    const observed = { model: completion.data.model,
      inputTokens: tokenUsage?.prompt_tokens ?? 0, outputTokens: tokenUsage?.completion_tokens ?? 0,
      totalTokens: tokenUsage?.total_tokens ?? (tokenUsage?.prompt_tokens ?? 0) + (tokenUsage?.completion_tokens ?? 0),
      latencyMs: Date.now() - started };
    const invalid = (code: string, message: string) => new KilnAuditResponseError(code, message, observed);
    const content = completion.data.choices[0].message.content?.trim();
    if (!content) throw invalid('KILN_EMPTY_RESPONSE', 'Kiln returned no audit content');
    const jsonText = content.startsWith('```') ? content.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '') : content;
    let parsed: unknown;
    try { parsed = JSON.parse(jsonText); }
    catch { throw invalid('KILN_INVALID_AUDIT', 'Kiln did not return a JSON audit'); }
    const audit = AuditOutputSchema.safeParse(parsed);
    if (!audit.success) throw invalid('KILN_INVALID_AUDIT', 'Kiln audit failed schema validation');
    const expectedRules = [...new Set(input.paymentChecks.filter((check) => check.result === 'FAIL').map((check) => check.rule))].sort();
    const actualRules = audit.data.violations.map((violation) => violation.rule).sort();
    if (audit.data.verdict !== input.expectedVerdict || JSON.stringify(actualRules) !== JSON.stringify(expectedRules)) {
      throw invalid('KILN_AUDIT_MISMATCH', 'Kiln audit contradicted deterministic evidence');
    }
    const budgetFailure = audit.data.violations.find((violation) => violation.rule === 'MAX_AMOUNT');
    if (budgetFailure && input.policy?.maxAmount && input.payment &&
      (!budgetFailure.description.includes(input.policy.maxAmount) || !budgetFailure.description.includes(input.payment.totalAmount))) {
      throw invalid('KILN_AUDIT_MISMATCH', 'Kiln budget explanation omitted the allowed or actual amount');
    }
    return { audit: audit.data, ...observed };
  }

  async parsePolicy(instruction: string): Promise<KilnPolicyResult> {
    const key = process.env.KILN_API_KEY;
    if (!key) throw new ServiceUnavailableException({ code: 'KILN_NOT_CONFIGURED', message: 'KILN_API_KEY is not configured' });
    const baseUrl = (process.env.KILN_API_BASE_URL ?? 'https://api.bricksum.com/v1').replace(/\/$/, '');
    const model = process.env.KILN_MODEL ?? 'qwen3-32b';
    const started = Date.now();
    let response: Response;
    try {
      response = await fetch(`${baseUrl}/chat/completions`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model,
          messages: [
            { role: 'system', content: 'Extract only explicit spending-policy constraints. Return exactly one JSON object, no markdown or commentary, with keys maxAmount (non-negative decimal string with up to two fractional digits or null), currency (3-letter uppercase code or null), allowedMerchants (array of strings), deadline (ISO 8601 with timezone or null). Do not invent missing constraints. Never evaluate whether a transaction is allowed.' },
            { role: 'user', content: instruction },
          ],
          max_tokens: 1000,
          temperature: 0,
        }),
        signal: AbortSignal.timeout(90_000),
      });
    } catch {
      throw new BadGatewayException({ code: 'KILN_UNREACHABLE', message: 'Kiln request failed or timed out' });
    }
    if (!response.ok) {
      throw new BadGatewayException({ code: 'KILN_REQUEST_FAILED', message: `Kiln returned HTTP ${response.status}` });
    }
    let body: unknown;
    try { body = await response.json(); }
    catch { throw new BadGatewayException({ code: 'KILN_INVALID_RESPONSE', message: 'Kiln returned invalid JSON' }); }
    const completion = ChatCompletionSchema.safeParse(body);
    if (!completion.success) throw new BadGatewayException({ code: 'KILN_INVALID_RESPONSE', message: 'Kiln response shape was invalid' });
    const content = completion.data.choices[0].message.content?.trim();
    if (!content) throw new BadGatewayException({ code: 'KILN_EMPTY_RESPONSE', message: 'Kiln returned no policy content' });
    // JSON response_format is currently unsupported by Kiln, so validate text locally.
    const jsonText = content.startsWith('```') ? content.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '') : content;
    let policyJson: unknown;
    try { policyJson = JSON.parse(jsonText); }
    catch { throw new BadGatewayException({ code: 'KILN_INVALID_POLICY', message: 'Kiln did not return a JSON policy' }); }
    const policy = ParsedPolicySchema.safeParse(policyJson);
    if (!policy.success) throw new BadGatewayException({ code: 'KILN_INVALID_POLICY', message: 'Kiln policy failed schema validation' });
    const usage = completion.data.usage;
    return {
      policy: policy.data, model: completion.data.model,
      inputTokens: usage?.prompt_tokens ?? 0,
      outputTokens: usage?.completion_tokens ?? 0,
      totalTokens: usage?.total_tokens ?? (usage?.prompt_tokens ?? 0) + (usage?.completion_tokens ?? 0),
      latencyMs: Date.now() - started,
    };
  }
}
