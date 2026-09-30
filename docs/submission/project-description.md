# Agent Financial Black Box

**LLM interprets. Code enforces. Blockchain proves.**

Agent Financial Black Box is an audit trail for delegated financial actions. A user expresses a spending rule in natural language; Kiln's Qwen3-32B extracts a versioned policy. The agent's proposed amount, merchant, and deadline are checked by deterministic NestJS code, including fees. Human approval is explicit, and payments are recorded only as results reported by an external system.

The product preserves an append-only, hash-linked Case timeline. A final payment can be recorded even after a policy block, so a bypass becomes evidence rather than disappearing from the workflow. Qwen3-32B explains server-calculated audit findings, while the API rejects contradictory model output. A Solidity registry on Sepolia stores only a hashed Case ID and canonical evidence hash; the financial details stay off-chain. A flat Electron operations console and six thin MCP tools expose the same REST-backed workflow.

The live demo shows a compliant $45 payment, a blocked $42 proposal against a $30 limit, and a disputed $32 final charge after a $28 proposal. Two actual Sepolia transactions prove the compliant and disputed records, and both verify against the stored evidence. The dispute demonstrates the central distinction: **proof of integrity is not proof of compliance**.

**Stack:** TypeScript, NestJS, Prisma, PostgreSQL, Zod, Kiln/Qwen3-32B, MCP TypeScript SDK v2, Electron/React/Vite, Solidity, viem, Sepolia.

**Repository:** [github.com/kimnioyh/blackbox](https://github.com/kimnioyh/blackbox)
