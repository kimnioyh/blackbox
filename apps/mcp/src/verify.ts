import { randomUUID } from 'node:crypto';
import { Client, StreamableHTTPClientTransport } from '@modelcontextprotocol/client';

const url = new URL(process.env.MCP_URL ?? 'http://127.0.0.1:3100/mcp');
const client = new Client({ name: 'blackbox-local-verifier', version: '0.1.0' });
const transport = new StreamableHTTPClientTransport(url);

async function call(name: string, args: Record<string, unknown>): Promise<Record<string, unknown>> {
  const response = await client.callTool({ name, arguments: args });
  const content = response.content.find((item) => item.type === 'text');
  const text = content?.type === 'text' ? content.text : '';
  if (response.isError) throw new Error(`${name}: ${text}`);
  const parsed: unknown = JSON.parse(text);
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error(`${name}: invalid result`);
  return parsed as Record<string, unknown>;
}

try {
  await client.connect(transport);
  const listed = await client.listTools();
  const names = listed.tools.map((item) => item.name);
  const expected = ['start_financial_case', 'propose_financial_action', 'record_human_approval',
    'record_payment_result', 'audit_financial_case', 'get_financial_case'];
  if (expected.some((name) => !names.includes(name))) throw new Error(`Missing MCP tools: ${expected.filter((name) => !names.includes(name)).join(', ')}`);

  const id = randomUUID();
  const started = await call('start_financial_case', {
    instruction: 'Buy a keyboard from Amazon for no more than $30.',
    title: 'MCP verification - blocked keyboard', locale: 'en', idempotencyKey: `verify-${id}`,
  });
  if (typeof started.caseId !== 'string') throw new Error('start_financial_case returned no caseId');
  const repeatedStart = await call('start_financial_case', {
    instruction: 'Buy a keyboard from Amazon for no more than $30.',
    title: 'MCP verification - blocked keyboard', locale: 'en', idempotencyKey: `verify-${id}`,
  });
  if (repeatedStart.caseId !== started.caseId) throw new Error('start_financial_case replay created another Case');
  const proposalInput = {
    caseId: started.caseId, action: 'PURCHASE', merchant: 'Amazon', item: { name: 'Mechanical Keyboard' },
    subtotal: '38.00', fee: '4.00', totalAmount: '42.00', currency: 'USD', idempotencyKey: `verify-${id}`,
  };
  const proposal = await call('propose_financial_action', proposalInput);
  const repeatedProposal = await call('propose_financial_action', proposalInput);
  const relatedCase = await call('get_financial_case', { caseId: started.caseId });
  if (proposal.result !== 'BLOCK' || relatedCase.status !== 'BLOCKED' ||
    repeatedProposal.result !== proposal.result ||
    !Array.isArray(proposal.reasonCodes) || !proposal.reasonCodes.includes('BUDGET_EXCEEDED')) {
    throw new Error('MCP blocked-flow verification failed');
  }
  const eventTypes = Array.isArray(relatedCase.timeline)
    ? relatedCase.timeline.map((item) => (item as { eventType?: string }).eventType) : [];
  if (!eventTypes.includes('POLICY_CHECK') || !eventTypes.includes('PAYMENT_BLOCKED') || eventTypes.length !== 5) {
    throw new Error(`Unexpected timeline after idempotent replay: ${eventTypes.join(', ')}`);
  }
  process.stdout.write(JSON.stringify({ endpoint: url.toString(), tools: names, caseId: started.caseId,
    policy: started.policy, policyResult: proposal.result, reasonCodes: proposal.reasonCodes,
    caseStatus: relatedCase.status, timelineEvents: eventTypes }, null, 2) + '\n');
} finally {
  await client.close();
}
