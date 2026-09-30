# Final demo script (target: 2:50; maximum: 3:00)

Use the three prepared Cases in the dashboard. Keep this page or a printed cue sheet off the recording. The exact IDs are listed below for preflight; navigate by the table titles during the video.

| Story | Case ID | Dashboard title |
| --- | --- | --- |
| Compliant | `cmumtu7n70000u8yw4v07evjp` | Phase 6 normal |
| Blocked | `cmunels8q000cp0yw55p4it62` | Blocked Amazon keyboard purchase |
| Disputed | `cmumtuehv0007u8yw31ptuymh` | Phase 6 violation |

## 0:00–0:20 — Problem

**Screen:** Dashboard, then point to the three Case statuses.

**Say:** “AI agents can spend for us, but a payment record alone cannot show what the user authorized, what the agent understood, why an action passed, or whether the final charge stayed within scope. Agent Financial Black Box preserves that chain of evidence.”

## 0:20–0:55 — Compliant case

**Screen:** Open **Phase 6 normal**. Show the user instruction, Qwen3-32B policy, `ALLOW` check, explicit `APPROVED` decision, `SUCCESS` payment, and `VERIFIED` status. The policy allows Amazon up to **$50.00**; the actual total is **$45.00**.

**Say:** “Qwen interprets the natural-language instruction into a structured policy. Code checks the total, merchant, and deadline. This $45 Amazon payment passed the $50 limit, a human approved it, and the external payment was recorded.”

## 0:55–1:25 — Blocked case

**Screen:** Return to the table; open **Blocked Amazon keyboard purchase**. Point to **$30.00** policy, **$42.00** proposal, `MAX_AMOUNT: FAIL`, `BLOCK`, and `PAYMENT_BLOCKED` in the timeline.

**Say:** “Here the agent proposes $42 against a $30 budget. The deterministic maximum-amount check fails, so the Case is blocked and the blocked-payment event is preserved. There is no automatic successful payment. Numerical enforcement does not need an LLM.”

## 1:25–2:10 — Dispute and audit

**Screen:** Open **Phase 6 violation**. Show the **$30.00** policy, **$28.00** item/proposal, external **$28.00 subtotal + $4.00 fee = $32.00** payment, `DISPUTED` status, and Qwen audit `VIOLATION / MAX_AMOUNT` with its explanation.

**Say:** “The $28 proposal looked acceptable. The external system later reported a $4 fee, making the actual charge $32. We retain that successful payment even though it crosses the user's boundary. After a dispute, the audit compares the $30 authorization with the $32 actual total and Qwen explains the recorded violation.”

## 2:10–2:35 — Blockchain proof

**Screen:** On the disputed Case, show its on-chain proof and `verified: true`. If time permits, briefly show the [real Sepolia proof transaction](https://sepolia.etherscan.io/tx/0x935e7762a443f0357885e0b8bdc72073afde68e985636c2395631a3b38a87b96).

**Say:** “We hash a deterministic snapshot of the evidence and commit only that hash to Sepolia. This real transaction is in block **11810922**; verification returns **true**, and the audit marks `proofVerified: true`. Blockchain proves evidence integrity. It does not prove that the financial decision was correct.”

**Reference:** Sepolia `11155111`; contract `0xb7df386863cf3f1056e25d2b28a3f84b14799430`; [deployment transaction](https://sepolia.etherscan.io/tx/0x6ffbfc180e0ed3984fb5934f8cff6b4a1fa7031a410da03637067e4c09d9f5af); proof transaction `0x935e7762a443f0357885e0b8bdc72073afde68e985636c2395631a3b38a87b96`.

## 2:35–2:50 — Integration

**Screen:** Return to Dashboard. Point briefly to the README architecture or say the integrations without switching windows.

**Say:** “B2B services call the REST API. Existing AI agents can use MCP tools. Both reach the same NestJS rules and evidence store; operators review the outcome in this console.”

## 2:50–2:55 — Closing

**Screen:** Dashboard with the three Cases visible.

**Say:** “**LLM interprets. Code enforces. Blockchain proves. Every AI payment should be explainable.**”

Do not claim a fresh live chain verification if preflight could not reach Sepolia. If loading takes more than five seconds, use the recorded proof screen and keep the narration moving; never show secrets or terminal configuration.
