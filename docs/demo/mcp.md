# MCP adapter

The MCP server uses the stable v2 TypeScript SDK packages `@modelcontextprotocol/server` and `@modelcontextprotocol/node`. It has no database connection and calls only the NestJS REST API.

## Local run

Start PostgreSQL and the API first. Then, in another terminal:

```powershell
pnpm dev:mcp
```

The stateless Streamable HTTP endpoint is `http://127.0.0.1:3100/mcp`. Verify tool discovery and a blocked action:

```powershell
pnpm verify:mcp
```

The verifier starts a new Case, parses a $30 Amazon policy through Qwen3-32B, proposes a $42 action, and confirms `BLOCK`, `BUDGET_EXCEEDED`, `PAYMENT_BLOCKED`, and Case status `BLOCKED`. It does not record a payment or submit a blockchain transaction.

## Tools

| MCP tool | REST workflow |
| --- | --- |
| `start_financial_case` | Create Case, append USER_INSTRUCTION, parse policy |
| `propose_financial_action` | Append AGENT_DECISION, check policy |
| `record_human_approval` | Record explicit approval or rejection |
| `record_payment_result` | Record external payment; on SUCCESS, record Sepolia proof |
| `audit_financial_case` | Optionally create dispute, then audit |
| `get_financial_case` | Read Case detail and proof verification |

Set `MCP_API_BASE_URL` if the API is elsewhere. `MCP_PORT`, `MCP_HOST`, and `MCP_ALLOWED_HOSTNAMES` control HTTP binding and Host/Origin validation. The default binds only to loopback. There is no MCP authentication in this hackathon build.
