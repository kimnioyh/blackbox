# Agent Financial Black Box

**LLM interprets. Code enforces. Blockchain proves.**

Phase 1–2 foundation: NestJS core API, Electron desktop scaffold, shared Zod contracts, Prisma/PostgreSQL domain, and append-only event hash chain. Kiln, on-chain proof submission, MCP, and financial workflow endpoints belong to later phases.

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

`pnpm build`, `pnpm typecheck`, and `pnpm test` check the workspace. All API monetary values are decimal strings. Event payloads are validated by event type. Duplicate event requests with the same `(caseId, idempotencyKey)` return the stored event; reusing a key with different content returns 409.
