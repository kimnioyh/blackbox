# Agent Financial Black Box

**LLM interprets. Code enforces. Blockchain proves.**

The workspace contains the NestJS core API, an Electron audit console, shared Zod contracts, a Sepolia proof registry, and a thin Streamable HTTP MCP adapter. Financial policy checks stay in the API; the MCP server only orchestrates its REST endpoints.

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
pnpm dev:mcp
```

On PowerShell, use `Copy-Item .env.example apps/api/.env`.
`dev:api` builds once, then starts the server; rerun it after source edits.

API: `http://localhost:3000/api/v1`; Swagger: `http://localhost:3000/docs`.
MCP: `http://127.0.0.1:3100/mcp`. Run `pnpm verify:mcp` after the API and MCP server are running.

See [Phase 3 demo](docs/demo/phase3.md) for exact PowerShell API calls. Set `KILN_API_KEY` only in `apps/api/.env` or the API process environment. Kiln uses the documented `qwen3-32b` model ID.

See [Phase 4–5 verification](docs/demo/phase45.md) for approval, external payment, dispute, Sepolia proof deployment, and the three HTTP demo scenarios.

See [Phase 6 financial audit](docs/demo/phase6.md) for Qwen3-32B audit explanations, usage totals, and three reproducible HTTP scenarios.

The example environment uses the public Sepolia RPC at `https://ethereum-sepolia-rpc.publicnode.com` with `CHAIN_ID=11155111`. Set `CHAIN_RPC_URL` in `apps/api/.env` to switch providers. Keep `BLOCKCHAIN_PRIVATE_KEY` only in the ignored local environment file; the Electron renderer and MCP adapter never receive it.

See [MCP adapter verification](docs/demo/mcp.md) for the six tools, local commands, and remote binding settings.

`pnpm build`, `pnpm typecheck`, and `pnpm test` check the workspace. All API monetary values are decimal strings. Event payloads are validated by event type. Duplicate event requests with the same `(caseId, idempotencyKey)` return the stored event; reusing a key with different content returns 409.
