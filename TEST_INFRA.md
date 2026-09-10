# Test Infrastructure & Specification: Sol-Inquisitor

**Project**: Sol-Inquisitor (`@solana-agent-kit/plugin-adversary`)  
**Suite**: Requirement-Driven Opaque-Box E2E Testing Framework  
**Scope**: Tiers 1–4 Comprehensive Falsification & Security Verification  
**Standard**: 100% Offline, Zero External Network Dependency, Strict TypeScript ES2022  

---

## 1. Dual-Track Testing Methodology

Sol-Inquisitor employs a **Dual-Track Testing Architecture** that separates internal module unit testing from requirement-driven opaque-box end-to-end (E2E) verification:

- **Track 1 (Unit & Module Integration)**: Co-located unit suites (`tests/rugProbe.test.ts`, `tests/simulation.test.ts`, `tests/plugin.test.ts`, `tests/mcp.test.ts`) test isolated helper logic and class methods.
- **Track 2 (Opaque-Box Requirement-Driven E2E Suite)**: `tests/e2e.test.ts` treats the entire system as an impenetrable black box. All interactions occur exclusively through public interface contracts:
  - Public Solana Agent Kit V2 Plugin API (`auditTradeProposal`, `probeRug`, `assessMev`, `simulateProposal`, `actions`)
  - Public Model Context Protocol (MCP) Server protocol (`startMcpServer`, `tools/list`, `tools/call`)
  - Solana Ledger Pre-Flight Protocol (`simulateTransaction`, SPL Token state, and balance delta diffing)

```
+---------------------------------------------------------------------------------------+
|                       TRACK 2: OPAQUE-BOX E2E TEST HARNESS                            |
+---------------------------------------------------------------------------------------+
        │                                   │                                  │
        ▼ (MCP Protocol)                    ▼ (SAK V2 Actions API)             ▼ (Simulation)
+──────────────────────+           +──────────────────────+           +─────────────────+
| MCP Client & In-Mem  |           | SolInquisitorPlugin  |           | Web3 Wire Tx    |
| Transport            |           | Pipeline Orchestrator|           | Serializer      |
+──────────────────────+           +──────────────────────+           +─────────────────+
        │                                   │                                  │
        └───────────────────────────────────┼──────────────────────────────────┘
                                            ▼
+---------------------------------------------------------------------------------------+
|                                4-TIER FALSIFICATION MATRIX                            |
|                                                                                       |
|  [TIER 1: Feature Coverage]     >= 5 tests per requirement (R1, R2, R3, R4)           |
|  [TIER 2: Boundary & Corner]    >= 5 tests per requirement (Limits, Off-by-ones, Zod)|
|  [TIER 3: Pairwise Combinations] Multi-hazard matrix (Honeypot + MEV + Simulation)    |
|  [TIER 4: Real-World Scenarios] Autonomous agent live trading, rug evasion, sandwich  |
+---------------------------------------------------------------------------------------+
```

---

## 2. Feature Inventory Checklist

Every test case in the E2E suite traces directly to authoritative requirements in `ORIGINAL_REQUEST.md` and architecture definitions in `PROJECT.md`:

| Requirement | Feature ID | Description | Source Contract | Minimum Tier 1 Tests | Minimum Tier 2 Tests | Status |
|:---|:---|:---|:---|:---:|:---:|:---:|
| **R1. Rug & Honeypot** | **F1.1** | Freeze Authority Detection (+45 risk penalty, veto) | `probeRugRisks()`, `src/types.ts:75` | 5 | 5 | ✅ Covered |
| **R1. Rug & Honeypot** | **F1.2** | Mint Authority Detection (+35 risk penalty) | `probeRugRisks()`, `src/types.ts:75` | 5 | 5 | ✅ Covered |
| **R1. Rug & Honeypot** | **F1.3** | Top Holder Whale Concentration Analysis | `connection.getTokenLargestAccounts` | 5 | 5 | ✅ Covered |
| **R1. Rug & Honeypot** | **F1.4** | Honeypot Decision Rule (Total Risk >= 40 UNSAFE) | `src/plugin.ts:91`, `src/types.ts:118` | 5 | 5 | ✅ Covered |
| **R1. Rug & Honeypot** | **F1.5** | Fail-Secure Fallback on RPC / Account Error | `src/modules/rugProbe.ts:107` | 5 | 5 | ✅ Covered |
| **R2. Pre-Flight Sim** | **F2.1** | Pre-Flight RPC Simulation via `simulateTransaction` | `connection.simulateTransaction` | 5 | 5 | ✅ Covered |
| **R2. Pre-Flight Sim** | **F2.2** | Post-Balance Delta Diffing (`post - pre`) | `src/modules/simulation.ts:57` | 5 | 5 | ✅ Covered |
| **R2. Pre-Flight Sim** | **F2.3** | Slippage Boundary Enforcement (`delta < min`) | `src/modules/simulation.ts:77` | 5 | 5 | ✅ Covered |
| **R2. Pre-Flight Sim** | **F2.4** | On-Chain Revert Veto (`simResult.err !== null`) | `src/modules/simulation.ts:189` | 5 | 5 | ✅ Covered |
| **R2. Pre-Flight Sim** | **F2.5** | Wire Tx Deserialization (Legacy & Versioned) | `src/modules/simulation.ts:126` | 5 | 5 | ✅ Covered |
| **R3. MEV Guard** | **F3.1** | MEV Slippage Stratification (LOW/MED/HIGH/CRIT) | `assessMevRisk()`, `src/types.ts:106` | 5 | 5 | ✅ Covered |
| **R3. MEV Guard** | **F3.2** | Sandwich Vulnerability Scoring (> 300 bps) | `src/modules/mevGuard.ts:19` | 5 | 5 | ✅ Covered |
| **R3. MEV Guard** | **F3.3** | Recommended Safe Slippage Boundary (max 100 bps) | `src/modules/mevGuard.ts:71` | 5 | 5 | ✅ Covered |
| **R3. MEV Guard** | **F3.4** | Extractable Value Estimation (80% beyond 30 bps) | `src/modules/mevGuard.ts:63` | 5 | 5 | ✅ Covered |
| **R3. MEV Guard** | **F3.5** | Large USD Trade Size Penalty (> $10,000) | `src/modules/mevGuard.ts:58` | 5 | 5 | ✅ Covered |
| **R4. SAK V2 & MCP** | **F4.1** | SAK V2 Plugin Action Declarations & Metadata | `plugin.actions`, `src/types.ts:157` | 5 | 5 | ✅ Covered |
| **R4. SAK V2 & MCP** | **F4.2** | SAK Action Handlers Execution | `plugin.actions[].handler` | 5 | 5 | ✅ Covered |
| **R4. SAK V2 & MCP** | **F4.3** | MCP Server Initialization & Tool Discovery | `startMcpServer()`, `tools/list` | 5 | 5 | ✅ Covered |
| **R4. SAK V2 & MCP** | **F4.4** | MCP `audit_solana_trade` Invocations | `CallToolRequestSchema` | 5 | 5 | ✅ Covered |
| **R4. SAK V2 & MCP** | **F4.5** | MCP Protocol Error Handling & Fail-Secure Result | `src/mcp/server.ts:175` | 5 | 5 | ✅ Covered |

---

## 3. Test Architecture & Harness

### 3.1 Zero-Network Offline Protocol
- All tests execute strictly offline. No outbound HTTP/HTTPS or WebSocket connections are initiated.
- Network calls to `@solana/spl-token` and `@solana/web3.js` are intercepted using deterministic, high-fidelity mocks:
  - `splToken.getMint`: Returns complete `Mint` structures (`freezeAuthority`, `mintAuthority`, `supply`, `decimals`, `isInitialized`).
  - `Connection.getTokenLargestAccounts`: Returns valid `TokenAccountBalancePair[]` distributions.
  - `Connection.simulateTransaction`: Returns realistic `RpcResponseAndContext<SimulatedTransactionResponse>` payloads with execution units and instruction logs.

### 3.2 In-Memory MCP Client-Server Transport
- MCP integration is verified using the official `@modelcontextprotocol/sdk` in-memory transport (`InMemoryTransport.createLinkedPair()`).
- Tests instantiate full MCP Client and Server instances, transmitting wire JSON-RPC 2.0 messages bidirectionally across linked pipes without binding to host ports or stdio subprocesses.

### 3.3 Genuine Pre-Flight Wire Serialization
- Transactions simulated in Tier 2 and Tier 4 are compiled into true serialized Base64 Solana wire transactions (`Transaction.serialize({ requireAllSignatures: false, verifySignatures: false }).toString('base64')`).
- The simulation engine deserializes and validates the binary transaction payload before simulation.

---

## 4. Real-World Application Scenarios (Tier 4)

Tier 4 tests model realistic production workflows that autonomous agents encounter on the Solana blockchain:

1. **Scenario 1: Happy Path Autonomous Agent DEX Swap**:
   - Agent discovers a decentralized utility token with revoked mint/freeze authorities and distributed liquidity.
   - Proposed slippage is 50 bps (0.5%). Pre-flight simulation executes cleanly and returns positive balance delta matching output.
   - Sol-Inquisitor clears the trade with `decision: 'APPROVED'`, `verdict: 'PASSED'`. The agent proceeds to sign and broadcast.

2. **Scenario 2: Malicious Meme Honeypot Evasion**:
   - An autonomous momentum agent attempts to buy a newly launched viral meme token on a Solana DEX.
   - The token creator left `freezeAuthority` active to trap buyers after launch.
   - Sol-Inquisitor intercepts the proposal before signing, identifies the unrevoked freeze authority (+45 risk penalty), returns `decision: 'BLOCKED'`, and provides the explicit recommendation: `"Refuse trading: Honeypot hazard due to unrevoked freeze authority."`
   - The agent vetoes execution and preserves capital.

3. **Scenario 3: Whale Dumping Defense (Supply Concentration)**:
   - Agent intends to execute a substantial swap on a high-APR token pool.
   - Sol-Inquisitor probes top holder accounts and discovers that the top 5 wallets control 88% of circulating supply (+30 concentration penalty).
   - Inquisitor flags extreme whale concentration in audit recommendations and evaluates combined hazards.

4. **Scenario 4: Jito MEV Sandwich Attack Defense**:
   - During a period of network congestion, an autonomous agent's dynamic routing expands maximum slippage tolerance to 600 bps (6.0%).
   - Sol-Inquisitor intercepts the swap proposal, flags `CRITICAL` sandwich risk (`mevRiskScore: 95`), vetoes the transaction (`decision: 'BLOCKED'`), and outputs: `"Reduce slippage tolerance to maximum 100 bps (1.00%)."`
   - The agent adjusts slippage parameters to 100 bps and safely resubmits.

5. **Scenario 5: Hidden Transfer Tax / Token-2022 Fee Evasion**:
   - A malicious or misconfigured token charges a hidden 10% fee on transfers.
   - The agent expects 1,000 tokens with 100 bps (1%) slippage (minimum acceptable: 990 tokens).
   - Pre-flight RPC simulation reveals that the post-execution balance delta is only 900 tokens (a 10% deficit).
   - The balance delta diffing engine flags `slippageExceeded: true`, issues a pre-flight balance delta violation, and vetoes the transaction before signing.

6. **Scenario 6: Multi-Agent MCP Autonomous Trading Orchestration**:
   - An AI agent in Claude Desktop, Cursor, or Antigravity acts as a planner.
   - The planner invokes the `audit_solana_trade` MCP tool via the stdio/in-memory server before executing a trade.
   - The tool returns structured JSON analysis. The agent reads `decision: 'BLOCKED'`, parses the `vetoReasons`, and aborts without executing the transaction.

---

## 5. Coverage Thresholds & Integrity Guardrails

- **Total Test Count Target**: >= 50 comprehensive tests across all 4 tiers.
- **Tier 1 Minimums**: >= 5 tests each for R1 Honeypots, R2 Simulation, R3 MEV Guard, R4 SAK V2 & MCP (>= 20 tests total).
- **Tier 2 Minimums**: >= 5 tests each for boundary, off-by-one, limit values, and schema validations across R1-R4 (>= 20 tests total).
- **Tier 3 Minimums**: Pairwise interaction tests covering composite hazards (>= 8 tests total).
- **Tier 4 Minimums**: End-to-end multi-step agent scenarios with realistic state flows (>= 6 tests total).
- **Integrity Guarantee**:
  - Zero facade tests, zero dummy assertions (`expect(true).toBe(true)` forbidden).
  - All test assertions evaluate concrete domain fields (`decision`, `overallRiskScore`, `actualOutputDelta`, `recommendedMaxSlippageBps`, `freezeAuthority`, `vetoReasons`).
  - Strict compliance with `strict: true` TypeScript compilation.
