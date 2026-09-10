# Dispatch Assignment: Sub-Orchestrator for Milestone 1 (MCP Test Suite)

## Working Directory
/Users/samaraldico/sol-inquisitor/.agents/sub_orch_m1

## Parent
Conversation ID: 4e9f37f5-7876-4493-bd17-5aa5bc47f7c2

## Scope & Objective
Milestone 1: Automated Model Context Protocol (MCP) Server Unit Test Suite.
Author a comprehensive, fully offline Jest test suite in `tests/mcp.test.ts` to satisfy the acceptance criterion:
"MCP stdio server initializes properly and responds to tool listing for audit_solana_trade."

Required verifications in `tests/mcp.test.ts`:
1. Initialize `startMcpServer()` from `src/mcp/server.ts`.
2. Connect an in-memory client or mock transport (using `@modelcontextprotocol/sdk/client/index.js` and `@modelcontextprotocol/sdk/inMemory.js`).
3. Query `client.listTools()`: assert tools `audit_solana_trade`, `probe_token_rug`, and `assess_mev_risk` are registered.
4. Execute `client.callTool({ name: 'assess_mev_risk', arguments: { maxSlippageBps: 50 } })` and assert structured JSON report response with LOW risk.
5. Execute `client.callTool({ name: 'probe_token_rug', arguments: { targetMint: 'So11111111111111111111111111111111111111112' } })` and verify fail-secure or mock report.
6. Verify schema error handling when called with invalid inputs.
7. Zero external network access (fully mocked/offline).
8. Ensure `npm run build` and `npm test` pass with 0 errors.

## File Ownership
- Exclusively owns: `tests/mcp.test.ts`

## Inputs to Read
- /Users/samaraldico/sol-inquisitor/.agents/ORIGINAL_REQUEST.md
- /Users/samaraldico/sol-inquisitor/.agents/orchestrator_1/PROJECT.md
- /Users/samaraldico/sol-inquisitor/src/mcp/server.ts
- /Users/samaraldico/sol-inquisitor/src/types.ts

## Execution Pattern
You are a Sub-Orchestrator. Run the iteration loop:
1. Explorer -> Worker -> Reviewer -> Challenger -> Auditor -> Gate check.
2. Record verdicts in `GATE_STATUS.md`.
3. Report completion and handoff to parent.
