# Sol-Inquisitor Specification Mining Report: API Specs & Protocol Interfaces

**Date**: 2026-09-10T13:05:00Z  
**Agent**: Spec Miner Survey 3 (`teamwork_preview_spec_miner`)  
**Scope**: Solana Agent Kit V2 Plugin Specifications, Model Context Protocol (MCP) Server Specifications, Solana Web3 simulateTransaction APIs, SPL Token getMint & Largest Accounts, Risk Assessment & Veto Protocols.

---

## Features Discovered

| # | Category | Feature | Description | Inputs | Outputs | Error Behavior | Discovered Via |
|---|----------|---------|-------------|--------|---------|----------------|----------------|
| 1 | SAK V2 Plugin | `audit_trade_proposal` | Core adversarial pre-flight audit action: falsifies honeypot risks, evaluates freeze/mint authorities, whale concentration, MEV sandwich exposure, and RPC simulation balance deltas. | `TradeProposalInput` (`targetMint`, `expectedOutput`, `maxSlippageBps`, `walletPublicKey?`, `transactionBase64?`, `rpcUrl?`) | `AdversarialAuditReport` (`decision`, `verdict`, `overallRiskScore`, `breakdown`, `vetoReasons`, `recommendations`) | Zod validation error on malformed addresses or invalid inputs; fail-secure `BLOCKED` decision on on-chain query failure | `src/plugin.ts:225`, `src/types.ts:8`, SAK V2 Plugin Standard |
| 2 | SAK V2 Plugin | `probe_token_rug` | Direct token mint risk inspection action: detects active freeze authority (+45), active mint authority (+35), and whale concentration. Vetoes if total risk >= 40. | `RugProbeInput` (`targetMint: string`) | `RugRiskReport` (`mint`, `hasFreezeAuthority`, `hasMintAuthority`, `topHoldersSharePercentage`, `totalRiskScore`, `isUnsafe`, `reasons`) | Zod validation error if mint length < 32 or > 44; returns fail-secure report (`isUnsafe: true`, risk 100) on RPC failure | `src/plugin.ts:256`, `src/types.ts:50` |
| 3 | SAK V2 Plugin | `assess_mev_risk` | MEV sandwich attack stress-guard action: analyzes slippage tolerance and trade size to calculate sandwich vulnerability and recommended slippage boundaries. | `MevGuardInput` (`maxSlippageBps`, `expectedOutput?`, `tradeSizeUsd?`) | `MevRiskReport` (`slippageBps`, `mevRiskScore`, `riskLevel`, `sandwichVulnerability`, `estimatedExtractableValueBps`, `recommendedMaxSlippageBps`, `reasons`) | Zod validation error if `maxSlippageBps` < 0 or > 10000 | `src/plugin.ts:280`, `src/types.ts:56` |
| 4 | MCP Server | `tools/list` (ListTools) | Exposes available pre-flight security tools (`audit_solana_trade`, `probe_token_rug`, `assess_mev_risk`) to MCP clients with complete JSON Schemas. | `ListToolsRequest` (`params?: { cursor?: string }`) | `ListToolsResult` (`tools: Tool[]`) | Protocol-level error if server not initialized or transport disconnected | `@modelcontextprotocol/sdk/types.js:2423`, `src/mcp/server.ts:32` |
| 5 | MCP Server | `tools/call` (`audit_solana_trade`) | Native MCP tool invocation for Claude, Cursor, and Antigravity to audit proposed Solana trades and transactions before signing. | `CallToolRequest` (`params: { name: "audit_solana_trade", arguments: {...} }`) | `CallToolResult` (`content: [{ type: "text", text: string }]`) | Handled with `{ isError: true, content: [{ type: "text", text: "Sol-Inquisitor Error: ..." }] }` | `@modelcontextprotocol/sdk/types.js:2749`, `src/mcp/server.ts:110` |
| 6 | MCP Server | `tools/call` (`probe_token_rug`) | Native MCP tool invocation to probe token mint for freeze and mint authorities. | `CallToolRequest` (`params: { name: "probe_token_rug", arguments: { targetMint } }`) | `CallToolResult` (`content: [{ type: "text", text: string }]`) | Handled with `{ isError: true, content: [{ type: "text", text: "Sol-Inquisitor Error: ..." }] }` | `src/mcp/server.ts:139` |
| 7 | MCP Server | `tools/call` (`assess_mev_risk`) | Native MCP tool invocation to evaluate trade slippage against MEV sandwich attacks. | `CallToolRequest` (`params: { name: "assess_mev_risk", arguments: { maxSlippageBps, ... } }`) | `CallToolResult` (`content: [{ type: "text", text: string }]`) | Handled with `{ isError: true, content: [{ type: "text", text: "Sol-Inquisitor Error: ..." }] }` | `src/mcp/server.ts:153` |
| 8 | Solana Web3 | `connection.simulateTransaction` | Simulates a legacy or versioned wire transaction against current Solana ledger state. | `Transaction \| VersionedTransaction`, `SimulateTransactionConfig?` (`sigVerify`, `replaceRecentBlockhash`, `commitment`, `accounts`, `innerInstructions`) | `Promise<RpcResponseAndContext<SimulatedTransactionResponse>>` (`context: { slot }`, `value: { err, logs, unitsConsumed, accounts }`) | Throws on network failure; returns `value.err` if execution reverts or program aborts | `@solana/web3.js/lib/index.d.ts:3688`, `src/modules/simulation.ts:154` |
| 9 | Pre-Flight Engine | Balance Delta Diffing | Calculates `actualOutputDelta = postBalance - preBalance` and compares against `minAcceptableOutput = expectedOutput * (1 - maxSlippageBps / 10000)`. | `SimulateOptions` (`expectedOutput`, `maxSlippageBps`, `transaction?`, `mockOverride?`) | `SimulationReport` (`simulatedSuccess`, `actualOutputDelta`, `minAcceptableOutput`, `slippageExceeded`, `vetoed`, `reasons`) | Reverts or delta violations trigger `vetoed: true` | `src/modules/simulation.ts:34` |
| 10 | SPL Token | `getMint` | Retrieves and deserializes token mint account state, including freeze and mint authorities. | `Connection`, `address: PublicKey`, `commitment?: Commitment`, `programId?: PublicKey` | `Promise<Mint>` (`address`, `mintAuthority`, `supply`, `decimals`, `isInitialized`, `freezeAuthority`, `tlvData`) | Throws `TokenAccountNotFoundError`, `TokenInvalidAccountOwnerError`, or `TokenInvalidAccountSizeError` | `@solana/spl-token/src/state/mint.ts:75`, `src/modules/rugProbe.ts:48` |
| 11 | Solana Web3 | `connection.getTokenLargestAccounts` | Fetches the 20 largest token holding accounts for a given mint to analyze whale concentration. | `mintAddress: PublicKey`, `commitment?: Commitment` | `Promise<RpcResponseAndContext<Array<TokenAccountBalancePair>>>` (`address`, `amount`, `decimals`, `uiAmount`) | Throws if RPC call fails; handled gracefully with fallback reason | `@solana/web3.js/lib/index.d.ts:3317`, `src/modules/rugProbe.ts:71` |
| 12 | Pre-Flight Engine | Fail-Secure Fallback Protocol | Guarantees that if any on-chain probe, simulation, or RPC endpoint fails, the transaction proposal is vetoed by default. | Network/RPC timeout or exception during audit | Risk Score 100, `isUnsafe: true`, `decision: "BLOCKED"`, `vetoed: true` | Safe-by-default execution prevents funds loss when oracle/node is offline | `src/modules/rugProbe.ts:107`, `src/modules/simulation.ts:168` |

---

## Edge Cases

| # | Feature | Input | Observed Behavior |
|---|---------|-------|-------------------|
| 1 | SAK V2 Plugin & MCP | Invalid target mint address (`"short"`) | Zod validation error: `code: "too_small", minimum: 32, message: "Target mint must be a valid Solana base58 address"`. MCP returns `{ isError: true }`. |
| 2 | SAK V2 Plugin & MCP | Negative `expectedOutput` (`-50`) | Zod validation error: `code: "too_small", minimum: 0, message: "Expected output must be greater than zero"`. MCP returns `{ isError: true }`. |
| 3 | SAK V2 Plugin & MCP | Excessive slippage (`maxSlippageBps: 15000`) | Zod validation error: `code: "too_big", maximum: 10000, message: "Max slippage cannot exceed 100% (10000 bps)"`. |
| 4 | Rug Probe | Active `freezeAuthority` (not null) | Assigns +45 Risk score. Total risk 45 >= 40 threshold; token immediately flagged `isUnsafe: true`, proposal `BLOCKED`. |
| 5 | Rug Probe | Active `mintAuthority` (not null) | Assigns +35 Risk score. Total risk 35. If whale concentration >= 35% (+10), total risk 45 >= 40 -> flagged `isUnsafe: true`. |
| 6 | Rug Probe | Both `freezeAuthority` & `mintAuthority` active | Risk score = 45 + 35 = 80/100 (excluding concentration). Flagged `isUnsafe: true` with honeypot & dilution reasons. |
| 7 | Rug Probe | Extreme Whale Concentration (Top 5 >= 80% supply) | Concentration score = +30 Risk. Reasons cite exact percentage and whale warning. |
| 8 | Rug Probe | RPC Node failure / Non-existent mint | Throws `TokenAccountNotFoundError` or RPC timeout; caught by fail-secure handler returning risk 100, `isUnsafe: true`. |
| 9 | Simulation Engine | Transaction execution reverts on-chain (`simResult.err !== null`) | `simulatedSuccess: false`, `vetoed: true`, reasons capture verbatim `InstructionError` JSON. |
| 10 | Simulation Engine | Output delta violates slippage (`actualOutputDelta < minAcceptableOutput`) | `simulatedSuccess: true`, `slippageExceeded: true`, `vetoed: true`, reasons document expected vs minimum acceptable output. |
| 11 | Simulation Engine | No transaction wire supplied (dry-run mode) | Passes dry-run parameter audit: `simulatedSuccess: true`, `actualOutputDelta: expectedOutput`, `vetoed: false`. |
| 12 | Simulation Engine | Corrupted / malformed Base64 transaction string | Base64 decode / deserialization throws error; caught and flagged `simulatedSuccess: false`, `vetoed: true`. |
| 13 | MEV Guard | Critical slippage (`maxSlippageBps > 500`) | `mevRiskScore = 95`, `riskLevel = 'CRITICAL'`, `sandwichVulnerability = true`. Vetoes trade proposal. |
| 14 | MEV Guard | High trade size USD (`tradeSizeUsd > 10000` with slippage > 100 bps) | MEV risk score increased by +15 penalty (capped at 100) due to searcher bounty attractiveness. |
| 15 | MCP Server | Call to unknown tool name | MCP catches error and returns `{ isError: true, content: [{ type: "text", text: "Sol-Inquisitor Error: Unknown tool: ..." }] }`. |

---

## 5-Component Handoff Report

### 1. Observation

Direct code and type observations from the repository and installed npm dependencies:

1. **Installed Packages & Versions** (`package.json:38-52`):
   - `@modelcontextprotocol/sdk`: `1.30.0`
   - `@solana/spl-token`: `0.4.15`
   - `@solana/web3.js`: `1.99.0`
   - `zod`: `4.6.1`
   - `typescript`: `5.9.3`

2. **Solana Agent Kit V2 Plugin Interface Standard** (from authoritative sources and `src/types.ts:151-164`):
   ```typescript
   export interface PluginActionExample {
     input: Record<string, unknown>;
     output: Record<string, unknown>;
     explanation: string;
   }

   export interface PluginAction<T = any> {
     name: string;
     description: string;
     similes: string[];
     examples: PluginActionExample[];
     schema: z.ZodType<T>;
     handler: (agent: any, input: any) => Promise<any>;
   }
   ```

3. **MCP Stdio Server Architecture** (`@modelcontextprotocol/sdk/dist/esm/server/index.d.ts:73`, `stdio.d.ts:9`, `types.d.ts:2423, 2749`):
   - Server class: `Server` from `@modelcontextprotocol/sdk/server/index.js`
   - Transport: `StdioServerTransport` from `@modelcontextprotocol/sdk/server/stdio.js`
   - Request Schemas: `ListToolsRequestSchema` (`tools/list`), `CallToolRequestSchema` (`tools/call`)
   - Tool Definition structure: `{ name: string, description?: string, inputSchema: { type: 'object', properties: Record<string, any>, required?: string[] } }`
   - Return type: `{ content: Array<{ type: 'text', text: string }>, isError?: boolean }`

4. **Solana Web3 `simulateTransaction` Types** (`@solana/web3.js/lib/index.d.ts:2284, 2302, 1901`):
   - Overloads:
     ```typescript
     simulateTransaction(
       transaction: VersionedTransaction,
       config?: SimulateTransactionConfig
     ): Promise<RpcResponseAndContext<SimulatedTransactionResponse>>;

     simulateTransaction(
       transactionOrMessage: Transaction | Message,
       signers?: Array<Signer>,
       includeAccounts?: boolean | Array<PublicKey>
     ): Promise<RpcResponseAndContext<SimulatedTransactionResponse>>;
     ```
   - Configuration options (`SimulateTransactionConfig`):
     ```typescript
     type SimulateTransactionConfig = {
       sigVerify?: boolean;
       replaceRecentBlockhash?: boolean;
       commitment?: Commitment;
       accounts?: { encoding: 'base64'; addresses: string[] };
       minContextSlot?: number;
       innerInstructions?: boolean;
     };
     ```
   - Return payload (`SimulatedTransactionResponse`):
     ```typescript
     type SimulatedTransactionResponse = {
       err: TransactionError | string | null;
       logs: Array<string> | null;
       accounts?: (SimulatedTransactionAccountInfo | null)[] | null;
       unitsConsumed?: number;
       returnData?: TransactionReturnData | null;
       innerInstructions?: ParsedInnerInstruction[] | null;
     };
     ```
   - Wrapper: `RpcResponseAndContext<T> = { context: { slot: number }, value: T }`
   - Error: `type TransactionError = {} | string;`

5. **SPL Token `getMint` and Mint State** (`@solana/spl-token/src/state/mint.ts:20-38, 75-83`):
   - Mint layout:
     ```typescript
     export interface Mint {
       address: PublicKey;
       mintAuthority: PublicKey | null;
       supply: bigint;
       decimals: number;
       isInitialized: boolean;
       freezeAuthority: PublicKey | null;
       tlvData: Buffer;
     }
     ```
   - `getMint` function signature:
     ```typescript
     export async function getMint(
       connection: Connection,
       address: PublicKey,
       commitment?: Commitment,
       programId?: PublicKey // defaults to TOKEN_PROGRAM_ID
     ): Promise<Mint>;
     ```

6. **Solana Web3 `getTokenLargestAccounts`** (`@solana/web3.js/lib/index.d.ts:3317, 2802`):
   - Signature:
     ```typescript
     getTokenLargestAccounts(
       mintAddress: PublicKey,
       commitment?: Commitment
     ): Promise<RpcResponseAndContext<Array<TokenAccountBalancePair>>>;
     ```
   - Account Balance Pair:
     ```typescript
     type TokenAccountBalancePair = {
       address: PublicKey;
       amount: string;
       decimals: number;
       uiAmount: number | null;
       uiAmountString?: string;
     };
     ```

7. **Test Suite and Compilation Status**:
   - `npm test`: 3 test suites passed, 17 tests passed (0 failures).
   - `npm run build`: `tsc` compiles with exit code 0.
   - `npm run demo`: interactive terminal showcase executed cleanly with exit code 0.
   - MCP in-memory client test: correctly connected, listed 3 tools, executed `assess_mev_risk`, and caught schema validation errors.

---

### 2. Logic Chain

1. **Protocol Compatibility**:
   - The user request requires "Sol-Inquisitor" (`@solana-agent-kit/plugin-adversary`) to integrate with both Solana Agent Kit V2 and Model Context Protocol (MCP).
   - In SAK V2, the plugin exports `name`, `description`, and an array of `actions` conforming to `PluginAction`. Each action defines a Zod `schema`, `similes`, few-shot `examples`, and an async `handler`.
   - In MCP, the server exposes the `audit_solana_trade` tool over standard IO (`StdioServerTransport`), wrapping the SAK audit logic and serializing reports into standard text content blocks.

2. **Adversarial Falsification Engine (R1)**:
   - Solana honeypots exploit the SPL Token standard's `freezeAuthority` (which allows the creator to permanently freeze the buyer's token account, preventing selling) and `mintAuthority` (which allows the creator to mint infinite tokens and drain DEX liquidity).
   - By querying `getMint(connection, mintAddress)`:
     - If `freezeAuthority !== null`, risk score is penalized by +45. Since the unsafe threshold is 40, any unrevoked freeze authority immediately triggers a veto (`decision: 'BLOCKED'`).
     - If `mintAuthority !== null`, risk score is penalized by +35.
   - By querying `getTokenLargestAccounts(mintAddress)`:
     - Top 5 account balances are summed and divided by circulating `supply`. If top holders own >= 80% (+30), >= 50% (+20), or >= 35% (+10), concentration penalties are applied.
     - A token with mint authority (+35) and top 5 holders owning >= 35% (+10) results in risk score 45 >= 40, triggering an automatic honeypot veto.
   - Fail-secure protocol: If the mint account does not exist or the RPC times out, the token is flagged `isUnsafe: true` with risk score 100 to prevent autonomous agents from trading on unverified state.

3. **Pre-Flight RPC Simulation & Balance Diffing (R2)**:
   - Slippage attacks and honeypot transfer taxes occur during transaction execution.
   - Before signing or broadcasting, the agent passes the raw serialized transaction to `connection.simulateTransaction(tx, { replaceRecentBlockhash: true, sigVerify: false })`.
   - If `simResult.err !== null`, execution reverted on-chain (e.g. `Custom(1)` slippage check or transfer hook failure). The transaction is vetoed immediately.
   - Post-simulation balance diffing calculates `actualOutputDelta = postBalance - preBalance`.
   - If `actualOutputDelta < minAcceptableOutput`, where `minAcceptableOutput = expectedOutput * (1 - maxSlippageBps / 10000)`, the transaction violates slippage constraints and is vetoed (`slippageExceeded: true`, `vetoed: true`).

4. **MEV Sandwich Stress Guard (R3)**:
   - Solana searchers running Jito MEV bundles target DEX swaps with wide slippage tolerance.
   - Slippage tolerances are stratified into risk tiers:
     - `<= 50 bps` (0.5%): LOW risk (5/100)
     - `51 - 150 bps` (0.5% - 1.5%): LOW risk (15/100)
     - `151 - 300 bps` (1.5% - 3.0%): MEDIUM risk (45/100)
     - `301 - 500 bps` (3.0% - 5.0%): HIGH risk (75/100), `sandwichVulnerability: true`
     - `> 500 bps` (> 5.0%): CRITICAL risk (95/100), `sandwichVulnerability: true`
   - When MEV risk score >= 50, the proposal is vetoed and safe slippage boundaries (maximum 100 bps) are recommended.

5. **Decision Synthesis & Report Delivery (R4 & R5)**:
   - The plugin combines RugProbe, MevGuard, and Simulation into `AdversarialAuditReport`.
   - Decision is `BLOCKED` if `rugProbe.isUnsafe || mevGuard.mevRiskScore >= 50 || simulation.vetoed`.
   - The MCP stdio server binds this pipeline directly to `audit_solana_trade`.

---

### 3. Caveats

1. **Solana Agent Kit Package Dependency**:
   - The repository implements the standard SAK V2 `PluginAction` interface internally without an explicit `@sendaifun/solana-agent-kit` npm package dependency in `package.json`. This is beneficial as it prevents peer dependency conflicts and allows direct consumption by any agent framework.
2. **Token-2022 Extensions**:
   - `getMint` from `@solana/spl-token` supports standard SPL Token and Token-2022 (Tokenz) mint accounts. For Token-2022 transfer hooks or permanent delegates, the fail-secure simulation module intercepts hidden transfer fee taxes during pre-flight balance diffing.
3. **Network Independence**:
   - All tests in `tests/` use Jest mocks (`jest.mock('@solana/spl-token')` and mock connection objects). Live RPC network testing is supported in the CLI demo and via environment variable `SOLANA_RPC_URL`, but unit tests strictly run offline with zero external network dependency.

---

### 4. Conclusion

The specification survey reveals that Sol-Inquisitor's architecture, interfaces, and implementations are fully aligned with:
- The **Solana Agent Kit V2** plugin specification (`name`, `description`, `actions`, `similes`, `examples`, `schema: z.ZodType`, `handler`).
- The official **Model Context Protocol (MCP)** specification (`@modelcontextprotocol/sdk` v1.30.0, `Server`, `StdioServerTransport`, `ListToolsRequestSchema`, `CallToolRequestSchema`).
- The **Solana Web3** runtime interfaces (`simulateTransaction`, `SimulateTransactionConfig`, `SimulatedTransactionResponse`, `RpcResponseAndContext`, `getTokenLargestAccounts`).
- The **SPL Token** mint standard (`getMint`, `Mint`, `freezeAuthority`, `mintAuthority`, `supply`).

All 17 existing Jest unit tests pass, TypeScript compiles with zero errors in strict mode, the interactive CLI demo functions as expected, and the MCP stdio server correctly registers and responds to tool requests.

---

### 5. Verification Method

To independently verify all findings and specifications:

1. **Verify TypeScript Compilation**:
   ```bash
   cd /Users/samaraldico/sol-inquisitor
   npm run build
   ```
   *Expected result*: `tsc` exits with status 0, generating type definitions in `dist/`.

2. **Verify Automated Unit Tests**:
   ```bash
   npm test
   ```
   *Expected result*: 3 test suites and 17 tests pass in < 1 second with 0 network calls.

3. **Verify Interactive CLI Showcase**:
   ```bash
   npm run demo
   ```
   *Expected result*: Runs scenarios for Honeypot Interception (Freeze + Mint), MEV Sandwich Veto, and Clean Swap Approval. Exits with status 0.

4. **Verify MCP Server Tool Listing & Execution**:
   ```bash
   npx ts-node -e '
   import { startMcpServer } from "./src/mcp/server";
   import { Client } from "@modelcontextprotocol/sdk/client/index.js";
   import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
   async function run() {
     const server = await startMcpServer();
     const [cTrans, sTrans] = InMemoryTransport.createLinkedPair();
     await Promise.all([
       server.connect(sTrans),
       (async () => {
         const client = new Client({ name: "v", version: "1" }, { capabilities: {} });
         await client.connect(cTrans);
         const list = await client.listTools();
         console.assert(list.tools.some(t => t.name === "audit_solana_trade"), "Missing audit tool");
         console.log("MCP Tools Verified:", list.tools.map(t => t.name));
       })()
     ]);
   }
   run();'
   ```
   *Expected result*: Prints `MCP Tools Verified: [ 'audit_solana_trade', 'probe_token_rug', 'assess_mev_risk' ]`.

5. **Inspect Files for Interface Contracts**:
   - `src/types.ts`: Lines 8–46 (TradeProposalSchema), 50–63 (RugProbe/MevGuard schemas), 75–133 (Audit/Risk interfaces), 157–164 (PluginAction).
   - `src/plugin.ts`: Lines 27–52 (SolInquisitorPlugin constructor), 74–183 (auditTradeProposal pipeline), 222–303 (actions list).
   - `src/mcp/server.ts`: Lines 16–30 (MCP Server init), 32–107 (ListTools), 110–181 (CallTool).
   - `src/modules/rugProbe.ts`: Lines 22–144 (probeRugRisks logic and fail-secure handler).
   - `src/modules/simulation.ts`: Lines 34–252 (simulateAndVerifyProposal and balance delta diffing).
   - `src/modules/mevGuard.ts`: Lines 9–82 (assessMevRisk and slippage tiers).

---

*Report compiled by Spec Miner Survey 3 (`1e1b1a51-0eb0-46eb-8ac6-f7589b4f5917`).*
