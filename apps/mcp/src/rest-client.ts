export class RestApiError extends Error {
  constructor(readonly status: number, readonly code: string, message: string) {
    super(message);
    this.name = 'RestApiError';
  }
}

export class RestClient {
  constructor(private readonly baseUrl: string) {}

  async get<T>(path: string): Promise<T> { return this.request<T>('GET', path); }

  async post<T>(path: string, body: unknown, idempotencyKey?: string): Promise<T> {
    return this.request<T>('POST', path, body, idempotencyKey);
  }

  private async request<T>(method: string, path: string, body?: unknown, idempotencyKey?: string): Promise<T> {
    const response = await fetch(`${this.baseUrl.replace(/\/$/, '')}${path}`, {
      method,
      headers: {
        ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
        ...(idempotencyKey ? { 'Idempotency-Key': idempotencyKey } : {}),
      },
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
      signal: AbortSignal.timeout(180_000),
    });
    const payload: unknown = await response.json().catch(() => null);
    if (!response.ok) {
      const details = payload && typeof payload === 'object' ? payload as Record<string, unknown> : {};
      throw new RestApiError(response.status,
        typeof details.code === 'string' ? details.code : 'API_REQUEST_FAILED',
        typeof details.message === 'string' ? details.message : `REST API returned ${response.status}`);
    }
    return payload as T;
  }
}

export type CaseRecord = {
  id: string;
  title: string;
  status: string;
  externalCaseId: string | null;
  currentPolicy: unknown | null;
  events: Array<{ sequence: number; eventType: string; idempotencyKey: string; occurredAt: string; payload: Record<string, unknown> }>;
  approvals: unknown[];
  payments: unknown[];
  proofs: Array<{ txHash: string; status: string; chainId: number; blockNumber: string | null }>;
  audits: unknown[];
};

export type CaseListRecord = Pick<CaseRecord, 'id' | 'externalCaseId'>;
