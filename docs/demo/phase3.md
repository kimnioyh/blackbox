# Phase 3: instruction → parsed policy → deterministic block

The Kiln adapter uses Bricksum's documented `POST /v1/chat/completions` protocol and the currently served `qwen3-32b` model ID. Kiln does not support reliable `response_format` JSON mode, so the adapter requests JSON text and validates it with the shared Zod policy schema. The API key stays in the NestJS process environment; the Electron renderer never receives it.

## Start

From the repository root in PowerShell:

```powershell
Copy-Item .env.example apps/api/.env
# Edit apps/api/.env and set KILN_API_KEY. Do not commit the file.
docker compose up -d postgres
pnpm db:migrate
pnpm dev:api
```

Use an existing PostgreSQL server and set `DATABASE_URL` if Docker is unavailable. Swagger is at `http://localhost:3000/docs`.

## Run the example

In another PowerShell terminal:

```powershell
$api = 'http://localhost:3000/api/v1'
$case = Invoke-RestMethod -Method Post -Uri "$api/cases" -ContentType 'application/json' -Body '{"title":"Keyboard from Amazon under $50"}'
$caseId = $case.id

$instruction = @{
  eventType = 'USER_INSTRUCTION'
  actorType = 'USER'
  source = 'REST_API'
  verificationLevel = 'SELF_REPORTED'
  occurredAt = (Get-Date).ToUniversalTime().ToString('o')
  payload = @{ text = 'Buy a keyboard from Amazon for no more than $50.'; locale = 'en' }
} | ConvertTo-Json -Depth 10
Invoke-RestMethod -Method Post -Uri "$api/cases/$caseId/events" -Headers @{ 'Idempotency-Key' = 'demo-instruction-1' } -ContentType 'application/json' -Body $instruction

$parsed = Invoke-RestMethod -Method Post -Uri "$api/cases/$caseId/policy/parse" -Headers @{ 'Idempotency-Key' = 'demo-parse-1' }
$parsed.policy | Select-Object version,maxAmount,currency,allowedMerchants

$decision = @{
  eventType = 'AGENT_DECISION'
  actorType = 'AGENT'
  source = 'REST_API'
  verificationLevel = 'SELF_REPORTED'
  occurredAt = (Get-Date).ToUniversalTime().ToString('o')
  payload = @{
    action = 'PURCHASE'; merchant = 'Amazon'; item = @{ name = 'Keyboard' }
    subtotal = '48.00'; estimatedFee = '4.00'; estimatedTotal = '52.00'
    currency = 'USD'; reasonSummary = 'Selected a matching keyboard.'
  }
} | ConvertTo-Json -Depth 10
Invoke-RestMethod -Method Post -Uri "$api/cases/$caseId/events" -Headers @{ 'Idempotency-Key' = 'demo-decision-1' } -ContentType 'application/json' -Body $decision

$result = Invoke-RestMethod -Method Post -Uri "$api/cases/$caseId/policy/check" -Headers @{ 'Idempotency-Key' = 'demo-check-1' }
$result | ConvertTo-Json -Depth 10
Invoke-RestMethod -Method Get -Uri "$api/cases/$caseId" | ConvertTo-Json -Depth 12
```

Expected: `MAX_AMOUNT = FAIL`, `ALLOWED_MERCHANT = PASS`, `result = BLOCK`, and `reasonCodes` contains `BUDGET_EXCEEDED`. The Case detail contains the current Policy, ordered Events, and ModelInvocation token counts. A blocked check appends both `POLICY_CHECK` and `PAYMENT_BLOCKED`; it does not create a Payment.

`POST /policy/check` returns HTTP 200 for both ALLOW and BLOCK. Repeating either policy request with the same `Idempotency-Key` returns its original result. External callers may append `USER_INSTRUCTION` and `AGENT_DECISION`; policy and blocking events come from the API workflow.
