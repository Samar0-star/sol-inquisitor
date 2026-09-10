# Dispatch Assignment: Spec Miner Survey 3 (API Specs & Protocol Interfaces)

## Working Directory
/Users/samaraldico/sol-inquisitor/.agents/spec_miner_survey_3

## Objective
Extract and document the precise specification standards and API types for:
1. Solana Agent Kit V2 Plugin specifications:
   - Action interface structure (name, description, similes, schema with zod, handler function signature, return types).
   - Plugin definition structure and registration.
2. Model Context Protocol (MCP) Server specifications:
   - Server initialization (@modelcontextprotocol/sdk/server/index.js, stdio transport).
   - Tool definitions (name, description, inputSchema with json-schema/zod).
   - CallTool request handler for `audit_solana_trade`.
3. Solana Web3 / SPL Token interfaces:
   - Connection simulateTransaction options & return types (`SimulatedTransactionResponse`, `RpcResponseAndContext`, `TransactionError`).
   - Token mint layout (`Mint` from `@solana/spl-token`, `getMint`, `freezeAuthority`, `mintAuthority`, `supply`).
   - Token largest accounts (`getTokenLargestAccounts`).
4. Exact error codes, veto statuses, and risk assessment structures.

## Inputs
- /Users/samaraldico/sol-inquisitor/.agents/ORIGINAL_REQUEST.md
- Existing packages in `/Users/samaraldico/sol-inquisitor/node_modules`

## Output
Write your comprehensive specification report to `/Users/samaraldico/sol-inquisitor/.agents/spec_miner_survey_3/handoff.md`. Include exact interfaces, TypeScript types, and zod schemas.
Do NOT modify any code files.

## 2026-09-10T12:57:47Z
You are Spec Miner Survey 3.
Your working directory is /Users/samaraldico/sol-inquisitor/.agents/spec_miner_survey_3.
Read your task assignment at /Users/samaraldico/sol-inquisitor/.agents/spec_miner_survey_3/DISPATCH.md.
Also read /Users/samaraldico/sol-inquisitor/.agents/ORIGINAL_REQUEST.md.
Examine installed packages and official specifications for:
- Solana Agent Kit V2 Plugin action signatures, schemas (zod), and plugin format.
- MCP stdio server specification (@modelcontextprotocol/sdk), ListTools, CallTool for audit_solana_trade.
- Solana Web3 connection simulateTransaction options and return types.
- SPL Token getMint, freezeAuthority, mintAuthority, getTokenLargestAccounts.
- Do NOT modify any code.
Write your complete report to /Users/samaraldico/sol-inquisitor/.agents/spec_miner_survey_3/handoff.md and report back via send_message.

