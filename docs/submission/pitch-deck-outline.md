# Agent Financial Black Box — 7-slide pitch deck copy

Use concise text and product screenshots where available. The proof transaction is a real Sepolia record; do not imply blockchain judges policy compliance.

## Slide 1 — Title

**Agent Financial Black Box**

**Every AI payment should be explainable.**

**LLM interprets. Code enforces. Blockchain proves.**

Solo hackathon project.

## Slide 2 — Problem

**Autonomous payments create an accountability gap**

- AI agents increasingly act and spend for users.
- Payment records show what was charged, not what was authorized.
- Agent decisions and user boundaries are hard to reconstruct after failure.
- Disputes need evidence across instruction, decision, approval, and payment.

**Four questions:** What did the user authorize? What did the agent attempt? Why was it allowed or blocked? Can the evidence still be trusted?

## Slide 3 — Solution

**A financial black box for AI agents**

`User Instruction → Qwen Policy Parsing → Deterministic Enforcement → Human Approval → Payment → Blockchain Proof → Audit`

- Qwen3-32B translates natural language into structured constraints.
- Code enforces budget, merchant, and deadline boundaries.
- Append-only events preserve the lifecycle.
- Sepolia anchors evidence integrity.
- Qwen reconstructs recorded evidence for post-transaction audit.

## Slide 4 — Product

**One audit trail from instruction to dispute**

- Verified, Blocked, and Disputed Cases
- Append-only timeline and structured spending policies
- Deterministic checks and explicit human approval
- External payment evidence and on-chain proof
- Structured AI audit explanations and flow-level token usage

**Integration:** B2B REST API · MCP tools · Electron audit console

**Suggested visual:** dashboard showing the three prepared Cases, plus a cropped disputed Case audit detail.

## Slide 5 — Technical highlights

**AI only where AI is useful**

| Layer | What it does |
| --- | --- |
| AI — Kiln + Qwen3-32B | Policy extraction; audit explanation |
| Deterministic code | Total-amount, merchant, deadline checks |
| Evidence | Append-only events, idempotency, event hash chain |
| Blockchain | Canonical Case evidence hash; real Sepolia transaction; `verified: true` |
| Integration | REST and MCP, sharing one NestJS core |

**Measured demo usage:** 8 Qwen invocations / 5,091 tokens in the prepared three-Case dataset (2,611 input; 2,480 output). Refresh from `GET /api/v1/usage/summary` before presenting if the dataset changes.

## Slide 6 — Market and commercial potential

**Trust infrastructure for agentic commerce**

**Customers:** AI shopping agents · travel agents · enterprise purchasing agents · AI wallet products · autonomous commerce platforms

**Initial model:** usage-based B2B API/SDK · enterprise compliance and audit tier · higher-volume event ingestion plans

Infrastructure for companies building financially autonomous agents.

## Slide 7 — Roadmap and vision

**From hackathon prototype to financial agent infrastructure**

**Now:** policy control · human approval · event audit trail · Qwen audit · Sepolia integrity proof · REST + MCP

**Next:** signed agent identities · payment-provider integrations · richer policy templates · webhook ingestion · production async event pipeline · enterprise access control · agent-to-agent financial auditing · production blockchain/verifiable evidence options

> Autonomous agents should be able to spend — without making accountability autonomous too.
