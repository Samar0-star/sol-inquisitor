# Project: Sol-Inquisitor (@solana-agent-kit/plugin-adversary)

## Architecture
Sol-Inquisitor is a production-grade Solana Agent Kit V2 plugin and native Model Context Protocol (MCP) server that intercepts autonomous agent transaction proposals, tests them adversarially for honeypots, MEV sandwich exposure, and pre-flight balance deltas, and vetoes unsafe transactions before signing.

```
+-----------------------------------------------------------------------------------+
|                           AUTONOMOUS AGENT OR PLANNER                             |
|       (LangChain / ElizaOS / Antigravity / Cursor / Claude Desktop / CLI)        |
+-----------------------------------------------------------------------------------+
                                         │
                 ┌───────────────────────┴───────────────────────┐
                 ▼                                               ▼
+------------------------------------+         +------------------------------------+
|    Solana Agent Kit V2 Plugin      |         |     Native MCP Stdio Server        |
|     (@solana-agent-kit/plugin-     |         |    (sol-inquisitor-mcp / server)   |
|            adversary)              |         |                                    |
|  - audit_trade_proposal            |         |  - audit_solana_trade              |
|  - probe_token_rug                 |         |  - probe_token_rug                 |
|  - assess_mev_risk                 |         |  - assess_mev_risk                 |
+------------------------------------+         +------------------------------------+
                 │                                               │
                 └───────────────────────┬───────────────────────┘
                                         ▼
+-----------------------------------------------------------------------------------+
|                        SolInquisitorPlugin (Orchestrator)                         |
|                                 src/plugin.ts                                     |
+-----------------------------------------------------------------------------------+
                 │                               │                               │
                 ▼                               ▼                               ▼
+--------------------------------+  +---------------------------+  +-----------------+
|          RugProbe              |  |      SimulationEngine     |  |    MevGuard     |
|     src/modules/rugProbe.ts    |  |  src/modules/simulation.ts|  |src/modules/     |
|                                |  |                           |  |  mevGuard.ts    |
| - Freeze Authority (+45)       |  | - simulateTransaction()   |  | - Slippage tiers|
| - Mint Authority (+35)         |  | - Pre/Post Balance Delta  |  | - Extractable   |
| - Whale Concentration (>=80->30|  | - Slippage BPS Check      |  |   Value BPS     |
|   >=50->20, >=35->10)          |  | - Program Revert Veto     |  | - Recommended   |
| - Rejection Rule: >= 40 UNSAFE |  | - Fail-secure Revert Veto |  |   Boundary      |
+--------------------------------+  +---------------------------+  +-----------------+
                 │                               │                               │
                 └───────────────────────┬───────────────────────┘
                                         ▼
+-----------------------------------------------------------------------------------+
|                             Aggregated Decision Gate                              |
|   BLOCKED (if any veto triggered or score >= threshold)  |  APPROVED (Safe)      |
+-----------------------------------------------------------------------------------+
```

## Feature Inventory
| # | Feature | Description | Milestone | Source |
|---|---------|-------------|-----------|--------|
| 1 | Freeze Authority Detection | Flags active freeze authority and adds +45 risk score (immediate veto since 45 >= 40) | M1/Verified | ORIGINAL_REQUEST §R1 |
| 2 | Mint Authority Detection | Flags active mint authority (+35 risk score) | M1/Verified | ORIGINAL_REQUEST §R1 |
| 3 | Whale Concentration Analysis | Analyzes top 5 holders (>=80% -> +30, >=50% -> +20, >=35% -> +10) | M1/Verified | ORIGINAL_REQUEST §R1 |
| 4 | Honeypot Decision Rule | Rejects token if totalRiskScore >= 40 | M1/Verified | ORIGINAL_REQUEST §R1 |
| 5 | Fail-Secure Fallback | RPC query errors default to risk 100 and veto | M1/Verified | ORIGINAL_REQUEST §R1 |
| 6 | Pre-Flight RPC Simulation | Simulates transaction using connection.simulateTransaction() | M2/Verified | ORIGINAL_REQUEST §R2 |
| 7 | Balance Delta Diffing | Computes actualOutputDelta and compares against minAcceptableOutput | M2/Verified | ORIGINAL_REQUEST §R2 |
| 8 | Slippage Boundary Enforcement | Vetoes transaction if balance delta violates slippage bounds | M2/Verified | ORIGINAL_REQUEST §R2 |
| 9 | Revert Veto | Vetoes transaction if simulated execution reverts on-chain | M2/Verified | ORIGINAL_REQUEST §R2 |
| 10 | MEV Slippage Risk Stratification | Stratifies slippage into LOW (<=150 bps), MEDIUM (150-300 bps), HIGH (300-500 bps), CRITICAL (>500 bps) | M3/Verified | ORIGINAL_REQUEST §R3 |
| 11 | Sandwich Vulnerability Scoring | Flags sandwich vulnerability when slippage > 300 bps | M3/Verified | ORIGINAL_REQUEST §R3 |
| 12 | Recommended Safe Slippage | Computes recommended safe slippage boundary (max 100 bps) | M3/Verified | ORIGINAL_REQUEST §R3 |
| 13 | SAK V2 Plugin Actions | Exposes audit_trade_proposal, probe_token_rug, assess_mev_risk | M4/Verified | ORIGINAL_REQUEST §R4 |
| 14 | Native MCP Stdio Server | Exposes audit_solana_trade, probe_token_rug, assess_mev_risk over MCP stdio | M4/Verified | ORIGINAL_REQUEST §R4 |
| 15 | MCP Automated Unit Test Suite | Comprehensive tests for MCP tool listing and tool execution in tests/mcp.test.ts | M1 | Survey Gap |
| 16 | Interactive Terminal Demo | npm run demo covering honeypot defense, MEV veto, and clean trade approval | M5/Verified | ORIGINAL_REQUEST §R5 |
| 17 | Superteam Submission Assets (README) | README.md with ASCII architecture diagram, quick-start, Loom demo script | M2 | Survey Gap / R5 |
| 18 | Opaque-box E2E Test Suite | Tiers 1-4 comprehensive test suite verifying full system requirement-driven | E2E Track | Architecture |
| 19 | Final E2E Pass & Adversarial Hardening | 100% E2E test pass + Tier 5 adversarial stress testing | Final Milestone | Architecture |

## Milestones
| # | Name | Scope | Dependencies | Status |
|---|------|-------|-------------|--------|
| M1 | Automated MCP Server Test Suite | Author `tests/mcp.test.ts` verifying MCP server initialization, tool listing for `audit_solana_trade`, and offline tool calls | None | PLANNED |
| M2 | Superteam Earn Submission Assets & Documentation | Author root `README.md` containing ASCII architecture diagram, quick-start guide, MCP configs, and 2-minute word-for-word Loom demo script | None | PLANNED |
| E2E | Independent E2E Testing Suite Track | Design and implement opaque-box E2E test suite (Tiers 1-4), generate `TEST_INFRA.md`, publish `TEST_READY.md` | None | PLANNED |
| M3 | Final 100% E2E Pass & Adversarial Hardening | Phase 1: 100% E2E pass; Phase 2: Tier 5 adversarial stress testing and forensic audit verification | M1, M2, E2E | PLANNED |

## Interface Contracts
### SolInquisitorPlugin ↔ MCP Server
- `startMcpServer()` returns `Promise<Server>`
- Exposes tools: `audit_solana_trade`, `probe_token_rug`, `assess_mev_risk`
- Input: JSON object matching Zod schemas in `src/types.ts`
- Output: Standard MCP TextContent `{ type: 'text', text: JSON.stringify(report, null, 2) }`

### RugProbe ↔ SolInquisitorPlugin
- `probeRugRisks(connection: Connection, targetMintStr: string, options?: RugProbeOptions): Promise<RugRiskReport>`
- Returns: `{ mint, hasFreezeAuthority, hasMintAuthority, topHoldersSharePercentage, totalRiskScore, isUnsafe, reasons }`

### SimulationEngine ↔ SolInquisitorPlugin
- `simulateAndVerifyProposal(options: SimulateOptions): Promise<SimulationReport>`
- Returns: `{ simulatedSuccess, actualOutputDelta, minAcceptableOutput, slippageExceeded, vetoed, reasons, logs, unitsConsumed }`

### MevGuard ↔ SolInquisitorPlugin
- `assessMevRisk(input: MevGuardInput): MevRiskReport`
- Returns: `{ slippageBps, mevRiskScore, riskLevel, sandwichVulnerability, estimatedExtractableValueBps, recommendedMaxSlippageBps, reasons }`

## Code Layout
- `src/index.ts`: Public library exports & factory
- `src/types.ts`: TypeScript interfaces and Zod schemas
- `src/plugin.ts`: Solana Agent Kit V2 Plugin implementation
- `src/modules/rugProbe.ts`: Honeypot and authority falsification engine (R1)
- `src/modules/simulation.ts`: Pre-flight RPC simulation and balance diffing (R2)
- `src/modules/mevGuard.ts`: MEV sandwich stress guard (R3)
- `src/mcp/server.ts`: Native Model Context Protocol stdio server (R4)
- `src/cli/demo.ts`: Interactive CLI showcase demo (R5)
- `tests/rugProbe.test.ts`: Unit tests for rug probe
- `tests/simulation.test.ts`: Unit tests for simulation and balance deltas
- `tests/plugin.test.ts`: Integration tests for plugin actions and MEV guard
- `tests/mcp.test.ts`: Dedicated unit tests for MCP server (M1)
- `tests/e2e/`: Comprehensive opaque-box E2E test suites (E2E Track)
- `README.md`: Submission documentation and Loom script (M2)
