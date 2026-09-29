# Phase 4–5 verification

## Start API and database

From the repository root in PowerShell:

```powershell
pnpm install
Copy-Item .env.example apps/api/.env # only if no local .env exists yet
# Set DATABASE_URL and KILN_API_KEY in apps/api/.env.
docker compose up -d postgres
pnpm db:migrate
pnpm build
pnpm typecheck
pnpm test
pnpm dev:api
```

If Docker is unavailable, start an existing PostgreSQL server and point `DATABASE_URL` at it. The API and Kiln key stay on the server.

## Financial HTTP scenarios

In a second terminal:

```powershell
node scripts/verify-phase45.mjs
```

The script creates three Cases via HTTP, parses each policy with Kiln Qwen3-32B, and checks the persisted Case detail and timeline:

- Normal: `ALLOW`, explicit `APPROVED`, external `SUCCESS` payment.
- Blocked: `BLOCK`, `PAYMENT_BLOCKED`, zero automatic payments; it then records a later external `SUCCESS` payment to demonstrate the bypass audit trail.
- Dispute: an allowed $28 proposal followed by a $32 external payment and `DISPUTED` status.

The script also calls `POST /proofs`. Without blockchain credentials it expects `503 CHAIN_CONFIG_MISSING`; with a deployed contract and funded signer it expects a confirmed proof and calls `GET /proofs/verify`.

## Individual API calls

Use `http://localhost:3000/api/v1` as the base URL and replace `<caseId>` with an ID returned by `POST /cases`.

```powershell
$api = 'http://localhost:3000/api/v1'
$case = Invoke-RestMethod -Method Post -Uri "$api/cases" -ContentType 'application/json' -Body '{"title":"Manual payment demo"}'
$id = $case.id

# After adding USER_INSTRUCTION, parsing the policy, adding AGENT_DECISION,
# and checking the policy as shown in docs/demo/phase3.md:
$approval = Invoke-RestMethod -Method Post -Uri "$api/cases/$id/approvals" -Headers @{'Idempotency-Key'='manual-approval'} -ContentType 'application/json' -Body '{"decision":"APPROVED","approvedAmount":"45.00","currency":"USD"}'
$payment = Invoke-RestMethod -Method Post -Uri "$api/cases/$id/payments" -Headers @{'Idempotency-Key'='manual-payment'} -ContentType 'application/json' -Body '{"externalPaymentId":"provider-123","merchant":"Amazon","subtotal":"42.00","fee":"3.00","totalAmount":"45.00","currency":"USD","status":"SUCCESS"}'
$dispute = Invoke-RestMethod -Method Post -Uri "$api/cases/$id/disputes" -Headers @{'Idempotency-Key'='manual-dispute'} -ContentType 'application/json' -Body ('{"reason":"Charge exceeded the permitted budget","disputedPaymentId":"' + $payment.payment.id + '"}')
Invoke-RestMethod -Method Get -Uri "$api/cases/$id"
```

The approval endpoint represents an explicit human response. A payment is an external result report, including when policy previously returned `BLOCK`.

## Sepolia proof

The RPC and chain ID are already set in `.env.example`. To make a real transaction, set `BLOCKCHAIN_PRIVATE_KEY` in the ignored `apps/api/.env` to a funded Sepolia account's `0x`-prefixed private key. Never put the key in a command argument or commit it. The account that deploys `ProofRegistry` is its only authorized recorder, so use the same key for deployment and recording.

```powershell
pnpm --filter @blackbox/blockchain contract:compile
pnpm --filter @blackbox/blockchain contract:deploy
# Set PROOF_CONTRACT_ADDRESS in apps/api/.env to the printed contractAddress.
# Restart the API process so it reads the new configuration.
$proof = Invoke-RestMethod -Method Post -Uri "$api/cases/$id/proofs" -Headers @{'Idempotency-Key'='manual-proof'}
$verification = Invoke-RestMethod -Method Get -Uri "$api/cases/$id/proofs/verify"
$proof | Select-Object recordHash,chainId,contractAddress,txHash,blockNumber,status
$verification | Select-Object verified,currentRecordHash,onChainHash
```

Only the keccak256 digest of the Case ID and the evidence hash are written to Sepolia. The canonical snapshot includes the Case's stable identity fields, timeline events up to `evidenceSequence`, and policy, approval, and successful payment rows referenced by those events. The proof event and later activity are excluded from the original snapshot.
