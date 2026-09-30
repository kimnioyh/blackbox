# Agent Financial Black Box — Project Description

**Agent Financial Black Box** is audit and control infrastructure for AI agents that spend money on behalf of users. It records the full lifecycle of a financial action: the original instruction, the agent's interpretation and decision, policy enforcement, explicit human approval, the externally reported payment, and post-transaction audit.

Kiln's **Qwen3-32B** turns natural-language spending instructions into structured policies and explains audit findings. Deterministic code enforces budget limits, allowed merchants, and deadlines; the model does not make those comparisons. Important actions become append-only, hash-linked events. A canonical evidence hash can be anchored to **Ethereum Sepolia** and later independently verified, without putting financial or user data on-chain. When a payment is disputed, Qwen3-32B reconstructs the recorded evidence and produces a structured explanation of whether it complied with the user's original authorization.

The platform provides **REST APIs** for B2B agent services, **MCP tools** for existing AI agents, and an **Electron audit console** for verified, blocked, and disputed cases.

> **LLM interprets. Code enforces. Blockchain proves.**

**Objective:** Make autonomous payments explainable, enforceable, and independently auditable.

## Short version

Agent Financial Black Box records and controls the full lifecycle of an AI agent payment. Kiln's Qwen3-32B interprets user instructions, deterministic code enforces spending rules, and Ethereum Sepolia anchors an independently verifiable evidence hash. REST, MCP, and a desktop console expose the resulting audit trail.
