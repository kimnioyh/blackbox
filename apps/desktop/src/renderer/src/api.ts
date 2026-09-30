import type { CaseStatus } from '@blackbox/shared';

export type CaseRow = {
  id: string;
  title: string;
  status: CaseStatus;
  agentName: string | null;
  hasAgentDecision: boolean;
  amount: string | null;
  currency: string | null;
  hasProof: boolean;
  latestAuditVerdict: 'COMPLIANT' | 'VIOLATION' | 'INCONCLUSIVE' | null;
  createdAt: string;
};

export type CaseEvent = {
  id: string;
  sequence: number;
  eventType: string;
  actorType: string;
  occurredAt: string;
  source: string;
  verificationLevel: string;
  payload: Record<string, unknown>;
};

export type Policy = {
  version: number;
  maxAmount: string | null;
  currency: string | null;
  allowedMerchants: string[];
  deadline: string | null;
};

export type Payment = {
  id: string;
  merchant: string;
  subtotal: string;
  fee: string;
  totalAmount: string;
  currency: string;
  status: string;
  executedAt: string | null;
};

export type Proof = {
  id: string;
  status: string;
  chainId: number;
  contractAddress: string;
  txHash: string;
  blockNumber: string | null;
  recordHash: string;
};

export type Audit = {
  id: string;
  verdict: string;
  summary: string;
  violations: { rule: string; description: string }[];
  model: string;
  createdAt: string;
};

export type ModelInvocation = {
  flowType: string;
  model: string;
  totalTokens: number;
  latencyMs: number;
  success: boolean;
  createdAt: string;
};

export type CaseDetail = Omit<CaseRow, 'amount' | 'currency' | 'hasProof' | 'hasAgentDecision' | 'latestAuditVerdict'> & {
  currentPolicy: Policy | null;
  payments: Payment[];
  proofs: Proof[];
  audits: Audit[];
  modelInvocations: ModelInvocation[];
};

export type UsageBucket = { callCount: number; inputTokens: number; outputTokens: number; totalTokens: number };
export type UsageSummary = {
  policyExtraction: UsageBucket;
  auditExplanation: UsageBucket;
  total: UsageBucket;
};

export type ProofVerification = { verified: boolean; currentRecordHash: string; recordHash: string; onChainHash: string };

const apiBase = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:3000/api/v1';

async function get<T>(path: string): Promise<T> {
  const response = await fetch(`${apiBase}${path}`);
  if (!response.ok) throw new Error(`API request failed (${response.status})`);
  return response.json() as Promise<T>;
}

export const api = {
  cases: () => get<CaseRow[]>('/cases'),
  case: (id: string) => get<CaseDetail>(`/cases/${encodeURIComponent(id)}`),
  events: (id: string) => get<CaseEvent[]>(`/cases/${encodeURIComponent(id)}/events`),
  usage: () => get<UsageSummary>('/usage/summary'),
  verifyProof: (id: string) => get<ProofVerification>(`/cases/${encodeURIComponent(id)}/proofs/verify`),
};
