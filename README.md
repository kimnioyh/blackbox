# Agent Financial Black Box

**LLM interprets. Code enforces. Blockchain proves.**

Phase 1–3 foundation: NestJS core API, Electron desktop scaffold, shared Zod contracts, Prisma/PostgreSQL domain, append-only event hash chain, and the first instruction → policy → check workflow. On-chain proof submission, MCP, and payment workflows belong to later phases.

## Requirements

- Node.js 24+, pnpm 11+, PostgreSQL 17 (or Docker)

## Run

```bash
pnpm install
cp .env.example apps/api/.env
docker compose up -d postgres
pnpm db:generate
pnpm db:migrate
pnpm db:seed
pnpm dev:api
pnpm dev:desktop
```

On PowerShell, use `Copy-Item .env.example apps/api/.env`.
`dev:api` builds once, then starts the server; rerun it after source edits.

API: `http://localhost:3000/api/v1`; Swagger: `http://localhost:3000/docs`.

See [Phase 3 demo](docs/demo/phase3.md) for exact PowerShell API calls. Set `KILN_API_KEY` only in `apps/api/.env` or the API process environment. Kiln uses the documented `qwen3-32b` model ID.

The example environment uses the public Sepolia RPC at `https://ethereum-sepolia-rpc.publicnode.com` with `CHAIN_ID=11155111`. Set `CHAIN_RPC_URL` in `apps/api/.env` to switch providers. Keep `BLOCKCHAIN_PRIVATE_KEY` only in the ignored local environment file; blockchain transactions are not implemented yet.

`pnpm build`, `pnpm typecheck`, and `pnpm test` check the workspace. All API monetary values are decimal strings. Event payloads are validated by event type. Duplicate event requests with the same `(caseId, idempotencyKey)` return the stored event; reusing a key with different content returns 409.
