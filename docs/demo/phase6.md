# Phase 6 financial audit

The API computes final-payment budget, merchant, and deadline checks before calling Kiln Qwen3-32B. Qwen receives a compact evidence packet and writes a structured explanation. Its verdict and violation rules must match the server's checks. An invalid or contradictory model response produces an error and no successful `AuditResult`.

## Start

From the repository root, configure `DATABASE_URL` and `KILN_API_KEY` in the ignored `apps/api/.env`, then run:

```powershell
pnpm install
docker compose up -d postgres
pnpm db:migrate
pnpm build
pnpm typecheck
pnpm test
pnpm dev:api
```

If Docker is unavailable, point `DATABASE_URL` at an existing PostgreSQL server. The audit endpoint requires a real Kiln key. No blockchain signer is required for Cases without a proof.

## Run all three audit scenarios

In a second terminal:

```powershell
$run = node scripts/verify-phase6.mjs | Out-String | ConvertFrom-Json
$run | ConvertTo-Json -Depth 8
```

This makes real HTTP and Qwen3-32B requests for:

- A $45.00 Amazon payment under a $50.00 policy: `COMPLIANT`, no violations, Case `VERIFIED`.
- A $32.00 final payment under a $30.00 policy: `VIOLATION` with `MAX_AMOUNT`; the disputed Case remains `DISPUTED`.
- A Case without instruction, policy, or payment: `INCONCLUSIVE`.

The script checks the persisted `AuditResult`, `AUDIT_RESULT` event, `ModelInvocation`, and per-Case usage summary for each Case.

## Inspect or replay exact API calls

The audit POST uses an `Idempotency-Key`. Reusing `audit` below returns the result created by the script without another Qwen call:

```powershell
$api = 'http://localhost:3000/api/v1'
$id = $run.violation.caseId
Invoke-RestMethod -Method Post -Uri "$api/cases/$id/audits" -Headers @{'Idempotency-Key'='audit'} | ConvertTo-Json -Depth 8
Invoke-RestMethod -Method Get -Uri "$api/cases/$id" | ConvertTo-Json -Depth 12
Invoke-RestMethod -Method Get -Uri "$api/cases/$id/events" | ConvertTo-Json -Depth 12
Invoke-RestMethod -Method Get -Uri "$api/usage/summary?caseId=$id" | ConvertTo-Json -Depth 8
Invoke-RestMethod -Method Get -Uri "$api/usage/summary" | ConvertTo-Json -Depth 8
```

Use `$run.normal.caseId` or `$run.inconclusive.caseId` in place of `$run.violation.caseId` to inspect the other outcomes.

If a Case has a confirmed blockchain proof, `POST /audits` calls the existing Sepolia verification flow and includes `proofVerified` in its response. To make that branch work on a real Case, first deploy the registry and record a proof as described in [Phase 4–5 verification](phase45.md). Evidence integrity is separate from financial compliance.
