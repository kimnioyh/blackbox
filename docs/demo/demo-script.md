# Three-minute demo script

## Before recording

- Start PostgreSQL. On a fresh database, run the README's migration/build steps and `pnpm demo:import`. Then run `pnpm dev:api`, `pnpm dev:mcp`, and `pnpm dev:desktop` in separate terminals. The current local `apps/api/.env` points at `blackbox_demo`; `GET http://localhost:3000/api/v1/cases` should return exactly three Cases.
- Check `GET http://localhost:3000/api/v1/cases/cmumtuehv0007u8yw31ptuymh/proofs/verify` returns `verified: true`. Have the [dispute transaction](https://sepolia.etherscan.io/tx/0x935e7762a443f0357885e0b8bdc72073afde68e985636c2395631a3b38a87b96) open in a browser tab.
- Do not run `pnpm verify:mcp` against the demo database during the presentation: it creates a new Case. The end-to-end MCP verifier was run against the preserved development database before this three-Case copy was prepared.

## 0:00–0:25 — Problem and design

“A proposed agent purchase may pass a budget check, yet the final charge can differ. We capture every decision and later payment as evidence. **LLM interprets. Code enforces. Blockchain proves.**”

Show the Dashboard with exactly three rows: Blocked, Disputed, Verified. Point out the small on-chain indicators in the two proved rows and the measured Qwen token usage below the table.

## 0:25–1:00 — Blocked proposal

Open **Blocked Amazon keyboard purchase** (`cmunels8q000cp0yw55p4it62`). The MCP-sourced instruction sets a **$30.00** Amazon limit. The agent proposes **$38.00 + $4.00 fee = $42.00**. The deterministic check returns `BLOCK` with `BUDGET_EXCEEDED`; `PAYMENT_BLOCKED` follows in the timeline. There is no successful payment row. Say that MCP only calls the REST API; NestJS owns the rule.

## 1:00–1:40 — Compliant payment

Open **Phase 6 normal** (`cmumtu7n70000u8yw4v07evjp`). Show the **$50.00** Amazon policy, **$45.00** total, explicit `APPROVED` human decision, externally reported `SUCCESS` payment, and `COMPLIANT` audit. The Sepolia proof is confirmed and its integrity reads **Verified on-chain**. This Case's [transaction](https://sepolia.etherscan.io/tx/0x6ee2a53e4d89949d5ed6723ed23b33c7d84f7b8505f96e66114cb1424dca720b) is real.

## 1:40–2:35 — Bypass and dispute

Open **Phase 6 violation** (`cmumtuehv0007u8yw31ptuymh`). The **$28.00** proposal passes a **$30.00** policy. The external payment later reports **$28.00 subtotal + $4.00 fee = $32.00**. Show `DISPUTE_CREATED` and the `VIOLATION` audit. Its proof still verifies: the chain attests to the evidence, not to financial compliance. Open the [Sepolia transaction](https://sepolia.etherscan.io/tx/0x935e7762a443f0357885e0b8bdc72073afde68e985636c2395631a3b38a87b96).

## 2:35–3:00 — Architecture and close

Point to the six MCP tools and REST/Swagger endpoints in the README. “Qwen3-32B extracts and explains; code checks amounts, merchants, and deadlines; PostgreSQL preserves the timeline; Sepolia anchors its hash. The Electron console makes a bypass visible to an operator.”

If the RPC is briefly unavailable, show the already recorded transaction in the explorer and the persisted `CONFIRMED` proof; do not claim a live verification succeeded unless the endpoint returned `verified: true` during preflight.
