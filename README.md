# Agent Financial Black Box

**LLM interprets. Code enforces. Blockchain proves.**

An agent can make a purchase look compliant at the proposal stage, then report a different final charge. Agent Financial Black Box keeps the user's instruction, the agent's decision, the policy result, human approval, external payment, and later audit in one sequenced evidence timeline. It shows both blocked actions and payments that bypassed the policy boundary.

## What it does

1. A user states a spending rule in natural language. Kiln's **Qwen3-32B** extracts a structured policy: maximum amount, currency, allowed merchants, and deadline. The API validates the output with shared Zod schemas and stores a versioned Policy.
2. An agent records its proposed action. NestJS code checks the **total including fees**, merchant, and deadline. The model does not decide `ALLOW` or `BLOCK`. A block is a valid HTTP 200 business result and records `POLICY_CHECK` and `PAYMENT_BLOCKED` without executing a payment.
3. A human explicitly approves or rejects. A separate endpoint records an **externally executed** payment; this application has no payment gateway. It can record a successful payment even after a block so a bypass remains auditable.
4. The API audits the final payment against the policy. Qwen3-32B writes an explanation from server-calculated checks; the API rejects a model verdict that contradicts those checks.
5. A Sepolia `ProofRegistry` stores only a hashed Case identifier and a keccak256 evidence hash. The API verifies the saved snapshot against the database and the on-chain hash. Raw user or financial data stays off-chain.

## Architecture

```text
Electron + React audit console ─┐
REST clients ────────────────────┼─→ NestJS REST API ─→ Prisma ─→ PostgreSQL
MCP client → MCP HTTP adapter ───┘          │
                                            ├─→ Kiln / Qwen3-32B
                                            └─→ Sepolia ProofRegistry
```

| Workspace | Responsibility |
| --- | --- |
| `apps/api` | Case and Event workflows, deterministic policy checks, audit, usage, proof API, Swagger |
| `apps/mcp` | Stateless Streamable HTTP MCP tools that call the REST API; no database access |
| `apps/desktop` | Electron, React, Vite, and TypeScript audit console |
| `packages/shared` | Shared enums, API contracts, and Zod schemas |
| `packages/blockchain` | Solidity `ProofRegistry`, canonical hashing, and Sepolia client |

Events are append-only, sequenced per Case, and linked by the previous event hash. Monetary API values are fixed decimal strings such as `"50.00"`; Prisma stores them as `Decimal`. The proof snapshot stops at its recorded evidence sequence, so creating a proof event cannot invalidate that proof.

## API and MCP

Swagger is available at `http://localhost:3000/docs`; the REST base is `http://localhost:3000/api/v1`.

| REST endpoint | Purpose |
| --- | --- |
| `POST /cases`, `GET /cases`, `GET /cases/:caseId` | Create and inspect Cases |
| `POST /cases/:caseId/events`, `GET /cases/:caseId/events` | Record user instructions and agent decisions; read the timeline |
| `POST /cases/:caseId/policy/parse`, `POST /cases/:caseId/policy/check` | Interpret instructions; enforce policy deterministically |
| `POST /cases/:caseId/approvals`, `POST /cases/:caseId/payments`, `POST /cases/:caseId/disputes` | Explicit approval, external payment result, dispute |
| `POST /cases/:caseId/audits` | Explain the final-payment audit |
| `POST /cases/:caseId/proofs`, `GET /cases/:caseId/proofs/verify` | Commit and verify Sepolia evidence |
| `GET /usage/summary` | Qwen call counts and input/output/total tokens |

The MCP endpoint is `http://127.0.0.1:3100/mcp`. Its six tools are `start_financial_case`, `propose_financial_action`, `record_human_approval`, `record_payment_result`, `audit_financial_case`, and `get_financial_case`. It uses the TypeScript SDK v2 Streamable HTTP transport and delegates every business operation to the API. `pnpm verify:mcp` lists the tools and runs a real $30-policy / $42-proposal blocked flow; **it creates a Case**, so run it against a development database before presenting the clean demo database. See [MCP verification](docs/demo/mcp.md).

## Real Sepolia evidence

Chain ID: `11155111` · Registry: [`0xb7df386863cf3f1056e25d2b28a3f84b14799430`](https://sepolia.etherscan.io/address/0xb7df386863cf3f1056e25d2b28a3f84b14799430)

| Evidence | Case | Transaction | Verified on-chain |
| --- | --- | --- | --- |
| Compliant $45.00 payment under a $50.00 Amazon policy | `cmumtu7n70000u8yw4v07evjp` | [`0x6ee2a53e…dca720b`](https://sepolia.etherscan.io/tx/0x6ee2a53e4d89949d5ed6723ed23b33c7d84f7b8505f96e66114cb1424dca720b) | Yes |
| Disputed $32.00 charge under a $30.00 Amazon policy | `cmumtuehv0007u8yw31ptuymh` | [`0x935e7762…8a87b96`](https://sepolia.etherscan.io/tx/0x935e7762a443f0357885e0b8bdc72073afde68e985636c2395631a3b38a87b96) | Yes |

`GET /cases/:caseId/proofs/verify` reconstructed both stored snapshots and returned `verified: true` against Sepolia. Proof integrity does **not** imply that a payment complied with policy: the disputed proof verifies evidence of a violation.

## Local setup

Requirements: Node.js 24+, pnpm 11+, PostgreSQL 17 (or Docker). From the repository root:

```powershell
pnpm install
Copy-Item .env.example apps/api/.env  # only when the file does not already exist
docker compose up -d postgres
pnpm db:migrate
pnpm build
pnpm typecheck
pnpm test
```

Set `DATABASE_URL` and `KILN_API_KEY` in the ignored `apps/api/.env`. Policy parsing and audit explanations require the Kiln key. Proof verification needs `CHAIN_RPC_URL`, `CHAIN_ID=11155111`, and `PROOF_CONTRACT_ADDRESS`. Recording a **new** proof also needs a funded `BLOCKCHAIN_PRIVATE_KEY`; never commit it or expose it to Electron or MCP. The example file uses a public Sepolia RPC, which can be replaced through `CHAIN_RPC_URL`.

Run these in separate terminals:

```powershell
pnpm dev:api
pnpm dev:mcp
pnpm dev:desktop
```

`pnpm db:seed` creates example actor records, not the three pre-recorded Cases below. This machine's ignored `apps/api/.env` points at a separate local `blackbox_demo` database containing only those Cases; the original development database was preserved. A fresh installation can generate new financial and audit examples with `node scripts/verify-phase45.mjs` and `node scripts/verify-phase6.mjs`; see the [financial](docs/demo/phase45.md) and [audit](docs/demo/phase6.md) walkthroughs. New Case proofs require a configured funded Sepolia signer.

## Demo and submission

Use the three Cases in [the three-minute demo script](docs/demo/demo-script.md). The [project description](docs/submission/project-description.md) is ready for a hackathon submission form.
