# Dispatch Assignment: Worker MCP Test Suite

## Working Directory
/Users/samaraldico/sol-inquisitor/.agents/worker_mcp_test_1

## Objective
Author the complete, automated unit test suite for the Model Context Protocol (MCP) server in `/Users/samaraldico/sol-inquisitor/tests/mcp.test.ts`.

## Requirements to Satisfy
- Satisfy acceptance criterion: "MCP stdio server initializes properly and responds to tool listing for audit_solana_trade."
- Zero external network dependency: Use `@modelcontextprotocol/sdk/client/index.js` and `@modelcontextprotocol/sdk/inMemory.js` (`InMemoryTransport.createLinkedPair()`) to connect an in-memory test client to `startMcpServer()`.
- Test cases required:
  1. Server initialization: `startMcpServer()` starts cleanly.
  2. Tool listing: `client.listTools()` returns `audit_solana_trade`, `probe_token_rug`, and `assess_mev_risk`.
  3. Tool call `audit_solana_trade`: verifies valid response structure for clean trade proposal (APPROVED, low risk).
  4. Tool call `audit_solana_trade`: verifies blocked response for honeypot proposal or extreme slippage.
  5. Tool call `probe_token_rug`: returns risk report with expected fields.
  6. Tool call `assess_mev_risk`: returns MEV report with expected fields and risk level.
  7. Error handling: invalid arguments or missing required fields return `{ isError: true }` without crashing the server.
- Run `npm test` and ensure all tests in `tests/mcp.test.ts` and all existing tests pass 100%.

## File Ownership
- Exclusively owns: `/Users/samaraldico/sol-inquisitor/tests/mcp.test.ts`
- Do NOT edit other test files or `src/` files unless strictly necessary for export/typing.

## Inputs
- /Users/samaraldico/sol-inquisitor/.agents/ORIGINAL_REQUEST.md
- /Users/samaraldico/sol-inquisitor/.agents/orchestrator_1/PROJECT.md
- /Users/samaraldico/sol-inquisitor/src/mcp/server.ts
- /Users/samaraldico/sol-inquisitor/src/types.ts

## MANDATORY INTEGRITY WARNING
DO NOT CHEAT. All implementations must be genuine. DO NOT hardcode test results, create dummy/facade implementations, or circumvent the intended task. A teamwork_preview_auditor will independently verify your work. Integrity violations WILL be detected and your work WILL be rejected.

## Output
Write report to `/Users/samaraldico/sol-inquisitor/.agents/worker_mcp_test_1/handoff.md`. Include test run commands and passing test output.
