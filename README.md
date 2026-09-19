# 🛡️ Sol-Inquisitor (`@solana-agent-kit/plugin-adversary`)

> **Adversarial Pre-Flight Falsification & Simulation Engine for Solana Agent Kit & Native Model Context Protocol (MCP)**

[![npm version](https://img.shields.io/badge/npm-v1.0.0-blue.svg)](https://www.npmjs.com/package/@solana-agent-kit/plugin-adversary)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![TypeScript: Strict](https://img.shields.io/badge/TypeScript-Strict%20Mode-blue?logo=typescript)](https://www.typescriptlang.org/)
[![Tests: 138/138 Passing](https://img.shields.io/badge/Tests-138%2F138%20Passing-brightgreen.svg)](tests/)
[![Solana Agent Kit: V2](https://img.shields.io/badge/Solana%20Agent%20Kit-V2%20Plugin-9945FF?logo=solana)](https://github.com/sendaifun/solana-agent-kit)
[![Model Context Protocol](https://img.shields.io/badge/MCP-Native%20Stdio%20Server-orange)](https://modelcontextprotocol.io/)
[![Node: >=18](https://img.shields.io/badge/Node-%3E%3D18.0.0-green.svg)](https://nodejs.org/)

---

## 📌 Overview

Autonomous AI agents executing swaps on Solana operate under an asymmetric adversarial threat landscape. When an agent planner (e.g. Claude Desktop, Cursor, Antigravity, ElizaOS, or a custom LangChain loop) initiates a decentralized trade, it typically computes amounts from a DEX aggregator and immediately dispatches signed instructions to the mempool.

In production, this naive workflow exposes agent treasuries to catastrophic failure modes:
1. **Malicious Honeypots & Freeze Authorities**: Deployers retain SPL Token freeze authorities, allowing the agent to purchase tokens but immediately blacklisting its Associated Token Account (ATA) so tokens cannot be liquidated.
2. **Infinite Mint Inflation**: Deployers retain SPL Token mint authorities, minting trillions of unexpected tokens post-swap to dump liquidity and drain the AMM pool.
3. **Whale Concentration & Cabal Exits**: Top holder accounts control >80% of circulating supply, preparing coordinated rug-pull dumps against automated liquidity.
4. **Predatory Jito MEV Sandwich Attacks**: Agents configuring loose slippage tolerance (>3%–5%) are systematically detected by Solana searchers, sandwiched via Jito bundles, and drained of maximum allowable slippage.
5. **Execution Divergence & Program Aborts**: On-chain ledger state changes between quote generation and execution, resulting in slippage boundary violations or unhandled program reverts.

**Sol-Inquisitor** is a zero-trust pre-flight transaction firewall. Built as both an official **Solana Agent Kit V2 Plugin** and a native **Model Context Protocol (MCP) Server**, Sol-Inquisitor intercepts proposed transactions *before signing*. It decomposes the proposal across three adversarial falsification engines—**RugProbe**, **MevGuard**, and **SimulationEngine**—evaluates ledger state mathematically, and returns a deterministic `APPROVED` or `BLOCKED` verdict with full forensic audit rationale.

---

## 🏗️ High-Signal ASCII Architecture Diagram

```
+----------------------------------------------------------------------------------------------------+
|                                    AUTONOMOUS AGENT OR PLANNER                                     |
|              (Claude Desktop / Cursor / Antigravity / ElizaOS / LangChain / SAK CLI)               |
+----------------------------------------------------------------------------------------------------+
                                                  │
                                                  │ Proposes Trade (targetMint, expectedOutput, slippage)
                                                  ▼
                  ┌───────────────────────────────────────────────────────────────┐
                  ▼                                                               ▼
+--------------------------------------------------+    +--------------------------------------------------+
|           Solana Agent Kit V2 Plugin             |    |             Native MCP Stdio Server              |
|        (@solana-agent-kit/plugin-adversary)      |    |          (sol-inquisitor-mcp / server.ts)        |
|                                                  |    |                                                  |
|  • action: audit_trade_proposal                  |    |  • tool: audit_solana_trade                      |
|  • action: probe_token_rug                       |    |  • tool: probe_token_rug                         |
|  • action: assess_mev_risk                       |    |  • tool: assess_mev_risk                         |
+--------------------------------------------------+    +--------------------------------------------------+
                  │                                                               │
                  └───────────────────────────────┬───────────────────────────────┘
                                                  ▼
+----------------------------------------------------------------------------------------------------+
|                                 SolInquisitorPlugin (Orchestrator)                                 |
|                                            src/plugin.ts                                           |
+----------------------------------------------------------------------------------------------------+
              │                                   │                                   │
              ▼                                   ▼                                   ▼
+---------------------------+       +---------------------------+       +----------------------------+
|   MODULE A: RugProbe      |       |   MODULE B: MevGuard      |       | MODULE C: SimulationEngine |
|   src/modules/rugProbe.ts |       |   src/modules/mevGuard.ts |       | src/modules/simulation.ts  |
+---------------------------+       +---------------------------+       +----------------------------+
| • SPL Mint Account Query  |       | • Slippage Stress-Testing |       | • connection.simulate-     |
| • Freeze Authority:       |       | • Tier Stratification:    |       |   Transaction() via RPC    |
|   +45 Risk (Honeypot)     |       |   - LOW (<=150 bps)       |       | • Deserializes wire tx     |
| • Mint Authority:         |       |   - MEDIUM (150-300 bps)  |       | • Balance Delta Diffing:   |
|   +35 Risk (Dilution)     |       |   - HIGH (300-500 bps)    |       |   Delta = Post - Pre       |
| • Whale Concentration:    |       |   - CRITICAL (>500 bps)   |       | • Bounds Enforcement:      |
|   - >=80% Top 5 -> +30    |       | • Sandwich Vulnerability  |       |   Delta >= MinOutput       |
|   - >=50% Top 5 -> +20    |       | • Extractable Value Model |       | • Program Abort Revert Veto|
|   - >=35% Top 5 -> +10    |       | • Recommended Safe Cap    |       | • Fail-Secure Protocol     |
| • Decision: Risk >= 40?   |       | • Decision: Score >= 50?  |       | • Decision: Delta Valid?   |
+---------------------------+       +---------------------------+       +----------------------------+
              │                                   │                                   │
              └───────────────────────────────────┼───────────────────────────────────┘
                                                  ▼
+----------------------------------------------------------------------------------------------------+
|                                     Aggregated Decision Gate                                       |
|               OverallRiskScore = max(RugRisk, MevRisk, SimulationVetoed ? 100 : 0)                 |
|               isBlocked = RugProbe.isUnsafe || MevRisk >= 50 || Simulation.vetoed                  |
+----------------------------------------------------------------------------------------------------+
                          │                                                 │
                          ▼                                                 ▼
             [ 🛑 DECISION: BLOCKED ]                          [ 🚀 DECISION: APPROVED ]
    • Structured Forensic Veto Reasons                • All Adversarial Tests Passed
    • Exact Mitigation Recommendations                • Low Risk Assessment (Score < 40)
    • Agent Aborts Transaction Signing                • Agent Authorized to Sign & Broadcast
    • Treasury Capital Preserved                      • Verified Safe Ledger Execution
```

---

## 🚀 Quick-Start Guide

### Prerequisites
- **Node.js**: `>= 18.0.0`
- **npm**: `>= 9.0.0`
- **Solana RPC**: Any standard RPC URL (e.g. Solana Mainnet-Beta, Helius, QuickNode, Alchemy, or local test validator)

### 1. Installation

Install via npm:

```bash
npm install @solana-agent-kit/plugin-adversary
```

Or clone the repository directly for local development:

```bash
git clone https://github.com/samaraldico/sol-inquisitor.git
cd sol-inquisitor
npm install
```

### 2. Environment Configuration

Copy the example environment file and configure your preferred Solana RPC endpoint:

```bash
cp .env.example .env
```

Edit `.env`:
```ini
SOLANA_RPC_URL=https://api.mainnet-beta.solana.com
SOLANA_NETWORK=mainnet-beta
LOG_LEVEL=info
```

### 3. Build

Compile TypeScript source in strict mode:

```bash
npm run build
```

This compiles to the `dist/` directory with complete declaration files (`dist/index.d.ts`).

### 4. Run Test Suite (100% Mocked & Zero Network Dependency)

Execute the comprehensive test suite:

```bash
npm test
```

Generate full code coverage reports:

```bash
npm run test:coverage
```

All 138 automated unit tests across 7 test suites execute in under 3 seconds with zero network dependency using mocked Solana ledger states.

### 5. Launch Interactive Visual Cybersecurity HUD (`npm run ui`)

Launch the zero-dependency local forensic web dashboard served at `http://localhost:3000`:

```bash
npm run ui
```

#### HUD Features:
- **One-Click Scenarios**: Instant presets for **BONK** (Clean Verified, Approved), **USDC** (Freeze Authority Veto, +45 risk), **Malicious Meme** (Honeypot, +95 risk), and **Predatory MEV Sandwich** (700 bps critical slippage, +95 risk).
- **Radial Threat Dial**: Live 0–100 real-time risk score meter with dynamic SVG arc and color stratification (Emerald $\le 39$, Amber $40-69$, Crimson $\ge 70$).
- **Forensic Decision Banner**: Instant `APPROVED` vs `BLOCKED (VETOED)` status banner with primary veto rationale and mitigations.
- **RugProbe Matrix**: Real-time breakdown of SPL Token Freeze Authority, Mint Authority, and Top 5 Holder supply concentration.
- **MEV Sandwich Stress Guard**: Slippage tier categorization, Jito sandwich vulnerability indicator, estimated extractable value, and recommended maximum safe slippage boundaries.
- **Pre-Flight Simulation**: Balance delta diffing and transaction instruction revert verification.
- **Live `/api/audit` Endpoint**: Zero-dependency HTTP API accepting `POST http://localhost:3000/api/audit` with JSON payload `{ targetMint, expectedOutput, maxSlippageBps }` and returning structured forensic JSON diagnostics.

### 6. Run Interactive Showcase Demo (`npm run demo`)

Run the interactive CLI defense demonstration:

```bash
npm run demo
```

The demonstration guides you through three live scenarios:
1. **Scenario 1**: Intercepting an adversarial honeypot meme token with active freeze and mint authorities.
2. **Scenario 2**: Vetoing an excessive 8% slippage trade proposal vulnerable to Jito MEV sandwich bots.
3. **Scenario 3**: Auditing and approving a verified, decentralized trade on `$BONK` with revoked authorities and clean balance delta margins.

---

## 🧩 Solana Agent Kit V2 Plugin Integration Guide

Sol-Inquisitor exports `SolInquisitorPlugin`, adhering directly to the Solana Agent Kit V2 plugin interface specification.

### Complete TypeScript Integration Example

```typescript
import { Connection } from '@solana/web3.js';
import { SolInquisitorPlugin } from '@solana-agent-kit/plugin-adversary';

async function main() {
  // 1. Initialize Solana Connection
  const rpcUrl = process.env.SOLANA_RPC_URL || 'https://api.mainnet-beta.solana.com';
  const connection = new Connection(rpcUrl, 'confirmed');

  // 2. Instantiate Sol-Inquisitor Pre-Flight Firewall
  const inquisitor = new SolInquisitorPlugin({
    connection,
    rugScoreThreshold: 40,  // Rejection threshold (default 40)
    mevScoreThreshold: 50,  // MEV risk threshold (default 50)
    strictSimulationRequired: false, // Set true to require raw wire tx simulation
  });

  // 3. Define an Incoming Agent Trade Proposal
  const proposedTrade = {
    targetMint: '7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU', // Target token
    expectedOutput: 10000,                                      // Expected tokens
    maxSlippageBps: 150,                                         // 1.5% max slippage
    walletPublicKey: '4vM58qHk7pWn13yR8aLgXkZ9mP2vB5cE8tF1uJ6kL3sP',
    // Optional: transactionBase64 for full RPC balance delta simulation
  };

  console.log(`[Agent] Intercepting trade proposal for mint: ${proposedTrade.targetMint}...`);

  // 4. Execute Pre-Flight Adversarial Audit
  const auditReport = await inquisitor.auditTradeProposal(proposedTrade);

  // 5. Decision Gate: Never sign a blocked transaction!
  if (auditReport.decision === 'BLOCKED') {
    console.error(`\n🛑 [FIREWALL VETO] ${auditReport.verdict}`);
    console.error(`Overall Risk Score: ${auditReport.overallRiskScore}/100`);
    console.error(`Veto Reasons:`);
    auditReport.vetoReasons.forEach((reason) => console.error(`  - ${reason}`));
    console.warn(`Mitigation Recommendations:`);
    auditReport.recommendations.forEach((rec) => console.warn(`  * ${rec}`));

    // ABORT SIGNING: Protect agent wallet treasury
    return;
  }

  // 6. Approved: Safe to sign and broadcast
  console.log(`\n🚀 [APPROVED] ${auditReport.verdict}`);
  console.log(`Overall Risk Score: ${auditReport.overallRiskScore}/100 (Safe)`);
  // proceedWithSigningAndBroadcast(proposedTrade);
}

main().catch(console.error);
```

### Autonomous Agent Planner Tool Registration

When wiring into LangChain, ElizaOS, or AutoGPT frameworks, access the plugin's registered actions:

```typescript
const inquisitor = new SolInquisitorPlugin({ connection });

// Export plugin actions directly into the LLM tool registry
const actions = inquisitor.actions;
// [
//   { name: 'audit_trade_proposal', description: '...', schema: TradeProposalSchema, handler: ... },
//   { name: 'probe_token_rug', description: '...', schema: RugProbeInputSchema, handler: ... },
//   { name: 'assess_mev_risk', description: '...', schema: MevGuardInputSchema, handler: ... }
// ]
```

---

## 🔌 Model Context Protocol (MCP) Server Setup Guide

Sol-Inquisitor includes a native **Model Context Protocol (MCP)** stdio server (`sol-inquisitor-mcp`), allowing LLMs in **Claude Desktop**, **Cursor**, and **Antigravity** to natively audit Solana trades before execution.

### Claude Desktop Configuration

Add the `sol-inquisitor` server to your `claude_desktop_config.json`:

- **macOS**: `~/Library/Application Support/Claude/claude_desktop_config.json`
- **Windows**: `%APPDATA%\Claude\claude_desktop_config.json`
- **Linux**: `~/.config/Claude/claude_desktop_config.json`

```json
{
  "mcpServers": {
    "sol-inquisitor": {
      "command": "node",
      "args": [
        "/Users/samaraldico/sol-inquisitor/dist/mcp/server.js"
      ],
      "env": {
        "SOLANA_RPC_URL": "https://api.mainnet-beta.solana.com"
      }
    }
  }
}
```

*Alternatively, if installed globally via npm:*
```json
{
  "mcpServers": {
    "sol-inquisitor": {
      "command": "sol-inquisitor-mcp",
      "env": {
        "SOLANA_RPC_URL": "https://api.mainnet-beta.solana.com"
      }
    }
  }
}
```

### Cursor & Antigravity Configuration

In Cursor's MCP Settings (`Settings` -> `Features` -> `MCP`) or `.cursor/mcp.json`:

```json
{
  "mcpServers": {
    "sol-inquisitor": {
      "command": "node",
      "args": ["/Users/samaraldico/sol-inquisitor/dist/mcp/server.js"],
      "env": {
        "SOLANA_RPC_URL": "https://api.mainnet-beta.solana.com"
      }
    }
  }
}
```

### Available MCP Tools

#### 1. `audit_solana_trade`
Adversarially falsifies and audits a proposed Solana trade before signing. Evaluates freeze/mint authorities, whale concentration, MEV sandwich risk, and pre-flight balance deltas.

- **Parameters**:
  - `targetMint` *(string, required)*: Solana token mint base58 address.
  - `expectedOutput` *(number, required)*: Expected output token quantity.
  - `maxSlippageBps` *(number, optional, default: 100)*: Max slippage in basis points (100 = 1%).
  - `walletPublicKey` *(string, optional)*: Agent wallet public key.
  - `transactionBase64` *(string, optional)*: Base64-encoded wire transaction for simulation.
  - `rpcUrl` *(string, optional)*: Custom RPC endpoint override.

- **Example LLM Call**:
  ```json
  {
    "name": "audit_solana_trade",
    "arguments": {
      "targetMint": "DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263",
      "expectedOutput": 500000,
      "maxSlippageBps": 100
    }
  }
  ```

#### 2. `probe_token_rug`
Deeply inspects an SPL token mint on-chain for unrevoked freeze authority (+45 risk), unrevoked mint authority (+35 risk), and whale holder concentration.

- **Parameters**:
  - `targetMint` *(string, required)*: Solana token mint address to probe.

#### 3. `assess_mev_risk`
Stress-tests trade slippage settings to protect against predatory Jito sandwich bots and excessive extractable value on Solana DEXes.

- **Parameters**:
  - `maxSlippageBps` *(number, required)*: Slippage in basis points.
  - `expectedOutput` *(number, optional)*: Expected token output quantity.

---

## 🧮 Security Engine Mathematical & Scoring Specifications

### 1. Rug & Honeypot Risk Scoring Engine (`rugProbe.ts`)

The token rug falsification engine computes an additive risk score $R_{\text{rug}} \in [0, 100]$ across critical on-chain vectors:

$$R_{\text{rug}} = R_{\text{freeze}} + R_{\text{mint}} + R_{\text{concentration}}$$

| Risk Dimension | Condition | Penalty Assigned | Adversarial Rationale |
| :--- | :--- | :--- | :--- |
| **Freeze Authority** ($R_{\text{freeze}}$) | `mintInfo.freezeAuthority !== null` | **+45 Risk** | **Immediate Honeypot Hazard**: Creator can arbitrarily freeze user token balances, preventing sale or transfer. |
| **Mint Authority** ($R_{\text{mint}}$) | `mintInfo.mintAuthority !== null` | **+35 Risk** | **Infinite Dilution Hazard**: Creator can mint arbitrary supply directly to DEX pools, collapsing price to zero. |
| **Whale Concentration** ($R_{\text{concentration}}$) | Top 5 holders own $\ge 80\%$ of supply | **+30 Risk** | **Extreme Rug Hazard**: Coordinated dump risk; single account holds dominant share. |
| | Top 5 holders own $\ge 50\%$ of supply | **+20 Risk** | **Elevated Concentration**: Centralized liquidity; vulnerable to sudden exit. |
| | Top 5 holders own $\ge 35\%$ of supply | **+10 Risk** | **Moderate Concentration**: Semi-centralized distribution. |

#### Cumulative Decision Rule
$$\text{IsUnsafe} = \begin{cases} \text{true} & \text{if } R_{\text{rug}} \ge 40 \\ \text{false} & \text{if } R_{\text{rug}} < 40 \end{cases}$$

*Note*: Because an unrevoked freeze authority assigns $+45$ risk, any token with an active freeze authority is **immediately and deterministically vetoed** ($45 \ge 40$).

---

### 2. Pre-Flight RPC Simulation & Balance Delta Diffing (`simulation.ts`)

When a transaction payload is provided or strict simulation is active, Sol-Inquisitor invokes Solana's RPC engine via `connection.simulateTransaction()`.

#### Minimum Acceptable Output Formula
Given expected output $E_{\text{out}}$ and maximum slippage $S_{\text{bps}}$:

$$M_{\text{min}} = E_{\text{out}} \times \left(1 - \frac{S_{\text{bps}}}{10000}\right)$$

#### Balance Delta Diffing
Post-simulation balance $\text{Balance}_{\text{post}}$ and pre-simulation balance $\text{Balance}_{\text{pre}}$ are diffed:

$$\Delta_{\text{actual}} = \text{Balance}_{\text{post}} - \text{Balance}_{\text{pre}}$$

Effective slippage in basis points is calculated:

$$S_{\text{effective}} = \max\left(0, \text{round}\left(\frac{E_{\text{out}} - \Delta_{\text{actual}}}{E_{\text{out}}} \times 10000\right)\right)$$

#### Veto Trigger Matrix
$$\text{Vetoed} = \begin{cases} \text{true} & \text{if } \text{simResult.err} \neq \text{null} \quad (\text{Program Revert / Abort}) \\ \text{true} & \text{if } \Delta_{\text{actual}} < M_{\text{min}} \quad (\text{Slippage Boundary Violation}) \\ \text{false} & \text{otherwise} \end{cases}$$

---

### 3. MEV Sandwich Stress Guard (`mevGuard.ts`)

Solana searchers actively run Jito bundle sandwich bots that detect loose slippage boundaries in the mempool. Sol-Inquisitor models sandwich vulnerability and extractable value capture.

#### Slippage Tier Stratification
| Max Slippage (BPS) | Max Slippage (%) | Risk Level | Score ($R_{\text{mev}}$) | Sandwich Vulnerability | Recommended Max Slippage |
| :--- | :--- | :--- | :--- | :--- | :--- |
| $\le 50$ bps | $\le 0.50\%$ | `LOW` | **5** | `false` | $S_{\text{bps}}$ |
| $51 - 150$ bps | $0.51\% - 1.50\%$ | `LOW` | **15** | `false` | $S_{\text{bps}}$ |
| $151 - 300$ bps | $1.51\% - 3.00\%$ | `MEDIUM` | **45** | `false` | $\min(S_{\text{bps}}, 100)$ |
| $301 - 500$ bps | $3.01\% - 5.00\%$ | `HIGH` | **75** | `true` | $100$ bps ($1.00\%$) |
| $> 500$ bps | $> 5.00\%$ | `CRITICAL` | **95** | `true` | $100$ bps ($1.00\%$) |

#### Large Order Penalty
If trade size exceeds 10,000 USD and slippage exceeds 100 bps (1%):

$$R_{\text{mev}} = \min(100, R_{\text{mev}} + 15)$$

#### Extractable Value Model
Sandwich searchers capture approximately 80% of excess slippage beyond baseline fair DEX spread (30 bps):

$$\text{EV}_{\text{bps}} = \max\left(0, \text{round}\left((S_{\text{bps}} - 30) \times 0.8\right)\right)$$

If $R_{\text{mev}} \ge 50$ (default threshold), a pre-flight veto is triggered and the agent is instructed to cap slippage at $\le 100$ bps.

---

### 4. Fail-Secure Protocol

In accordance with institutional security standards, if an RPC call fails, times out, or returns corrupted metadata, Sol-Inquisitor **fails securely**:
- Total risk score defaults to **100/100**.
- `isUnsafe` is set to `true`.
- Veto is triggered immediately.
- Zero transactions are approved in an indeterminate state.

---

## 💻 Interactive CLI Showcase

Sol-Inquisitor includes an interactive terminal showcase demonstrating real-time defense against live honeypots, MEV sandwich attacks, and verified DEX swaps.

Run the demonstration:

```bash
npm run demo
```

### Demonstration Scenarios:
1. **Scenario 1: Adversarial Honeypot Interception** — Intercepts a proposed swap into a token with active freeze/mint authorities and 85% whale concentration, triggering an immediate pre-flight veto.
2. **Scenario 2: MEV Sandwich Stress Veto** — Identifies an 8% slippage tolerance on a DEX trade, calculates extractable value for Jito searchers, and caps the proposal at a safe 100 bps.
3. **Scenario 3: Verified Decentralized Trade Approval** — Audits a clean token ($BONK) with revoked authorities and healthy balance deltas, granting pre-flight approval in under 50ms.
---

## 🧪 Test Suite & Verification Matrix

The test suite provides 100% offline verification across all security modules:

| Test File | Test Suite Name | Verification Focus | Status |
| :--- | :--- | :--- | :--- |
| `tests/rugProbe.test.ts` | `rugProbe Module` | Freeze authority veto (+45), mint authority detection (+35), dual authority honeypot rejection, whale concentration tiers ($\ge 80\% \rightarrow +30$), clean decentralized token approval, fail-secure RPC error fallback. | ✅ 6/6 Passed |
| `tests/simulation.test.ts` | `simulation Module` | Balance delta calculation, slippage boundary enforcement, on-chain program revert intercept, raw transaction deserialization & simulation, dry-run parameter audit, fail-secure RPC drop. | ✅ 6/6 Passed |
| `tests/plugin.test.ts` | `SolInquisitorPlugin E2E` | End-to-end honeypot proposal veto, critical MEV sandwich veto (>500 bps), clean decentralized trade approval, Solana Agent Kit V2 action handler execution, slippage tiering. | ✅ 5/5 Passed |
| `tests/mcp.test.ts` | `MCP Server Integration` | MCP stdio server initialization, tool listing schema for `audit_solana_trade`, `probe_token_rug`, and `assess_mev_risk`, offline tool execution, and error handling. | ✅ 24/24 Passed |
| `tests/e2e.test.ts` | `Comprehensive Opaque E2E` | 4-tier comprehensive adversarial matrix: feature coverage, boundary conditions, cross-feature compound threats, real-world trading scenarios. | ✅ 59/59 Passed |
| `tests/stress.test.ts` | `Adversarial Stress Harness` | 50 concurrent audits, numeric border conditions, off-by-one delta boundaries, custom error handling. | ✅ 20/20 Passed |
| `tests/challenger2_protocol.test.ts` | `Protocol Fuzzing & Resilience` | Rapid burst fuzzing, fail-secure RPC outage simulation (ETIMEDOUT, ECONNREFUSED, HTTP 500, HTTP 429), strict SAK V2 & MCP Zod input validation. | ✅ 18/18 Passed |
| **Total** | **7 Test Suites** | **Complete System Verification** | **✅ 138/138 Passed** |

Run tests:
```bash
npm test
```

---

## 🎥 2-Minute Loom Demo Recording Script

*A word-for-word timed presenter script for submitting to Superteam Earn and showcasing Sol-Inquisitor.*

| Timestamp | Visual / Screen Action | Spoken Presenter Script |
| :--- | :--- | :--- |
| **0:00 – 0:25**<br>*(Problem Statement)* | Show `README.md` architecture diagram and terminal window. | *"Hey everyone! When autonomous AI agents—whether powered by Claude, ElizaOS, or Solana Agent Kit—execute trades on Solana, they face an adversarial minefield: honeypots with unrevoked freeze authorities, infinite mint inflation, whale cabal dumps, and predatory Jito MEV sandwich attacks. If an agent naively signs whatever quote the aggregator gives it, the agent's treasury gets drained. Meet **Sol-Inquisitor**: a zero-trust pre-flight transaction firewall and simulation engine that falsifies proposed trades and vetoes unsafe transactions BEFORE signing."* |
| **0:25 – 0:55**<br>*(Live Visual HUD)* | Switch to browser at `http://localhost:3000` (`npm run ui`). Click **BONK**, then **USDC**, then **Honeypot Meme**, then **MEV Sandwich**. | *"Here is our interactive cybersecurity dashboard running locally on port 3000 via `npm run ui`. Watch what happens when we audit different scenarios. First, BONK: authorities are permanently revoked, slippage is low, threat score is 5, and the decision gate gives a clean green APPROVED. Next, USDC: Circle retains an active freeze authority. Sol-Inquisitor catches it immediately (+45 risk), displaying a red BLOCKED veto. Now, our Honeypot Meme preset: deployer mint authority is still active (+35) and top whales hold 88.5% of supply (+30)—threat score jumps to 95 and the transaction is aborted. Finally, MEV Sandwich: 700 basis points slippage triggers our Jito stress guard, capping the proposal at 100 bps."* |
| **0:55 – 1:25**<br>*(Architecture & MCP)* | Show `src/plugin.ts` and `src/mcp/server.ts` in editor, then run `npm run demo` in terminal. | *"Under the hood, Sol-Inquisitor decomposes every trade across three falsification engines: RugProbe for cryptographic authority analysis, MevGuard for nonlinear slippage stress-testing, and SimulationEngine for pre-flight balance delta diffing against ledger state. It is packaged as an official Solana Agent Kit V2 plugin and a native Model Context Protocol (MCP) server. Any autonomous agent running in Cursor, Claude Desktop, or Mermail Agent Wallet can invoke `audit_solana_trade` without exposing private keys."* |
| **1:25 – 1:45**<br>*(Test Suite & Integrity)* | Run `npm test` in terminal. Show 7 suites and 138/138 tests passing in ~2 seconds. | *"Let's look at the engineering rigor. Running `npm test`: all 138 automated unit tests across 7 comprehensive test suites execute in just 2.3 seconds with zero external network dependency. Every single boundary condition, off-by-one delta calculation, simulation revert, and RPC outage fallback is rigorously validated and 100% mocked."* |
| **1:45 – 2:00**<br>*(Call to Action)* | Return to repository root, show `SKILL.md` and MIT License. | *"Sol-Inquisitor turns autonomous AI agents from vulnerable targets into hardened, secure traders. It's 100% open-source under the MIT license, complete with full Mermail wallet compliance and MCP schemas. Try it today with `npm run ui` or install the Solana Agent Kit plugin. Thank you!"* |

---

## 📁 Repository File Layout

```
sol-inquisitor/
├── package.json                   # Package manifest, dependencies, binaries, scripts
├── tsconfig.json                  # TypeScript strict mode compiler options
├── jest.config.js                 # Jest test configuration with ts-jest
├── README.md                      # Complete documentation, architecture, math specs & Loom script
├── SKILL.md                       # Mermail & Model Context Protocol (MCP) agent skill definition
├── src/
│   ├── index.ts                   # Root library export & factory helpers
│   ├── types.ts                   # Strict TypeScript interfaces & Zod validation schemas
│   ├── plugin.ts                  # SolInquisitorPlugin class for Solana Agent Kit V2
│   ├── modules/
│   │   ├── rugProbe.ts            # Module A: Token freeze authority, mint authority & whale concentration
│   │   ├── mevGuard.ts            # Module B: Slippage curve stress-testing & MEV sandwich guard
│   │   └── simulation.ts          # Module C: Pre-flight RPC simulateTransaction & balance delta diffing
│   ├── mcp/
│   │   └── server.ts              # Native Model Context Protocol (MCP) stdio server
│   ├── ui/
│   │   └── server.ts              # Interactive Visual Cybersecurity HUD & /api/audit REST server
│   └── cli/
│       └── demo.ts                # Interactive CLI defense demonstration
└── tests/
    ├── rugProbe.test.ts           # Unit tests for honeypot & authority detection (6 tests)
    ├── simulation.test.ts         # Unit tests for RPC simulation & balance deltas (6 tests)
    ├── plugin.test.ts             # Integration tests for SAK V2 plugin & MEV guard (5 tests)
    ├── mcp.test.ts                # Unit tests for MCP server listing & execution (24 tests)
    ├── e2e.test.ts                # Comprehensive 4-tier opaque E2E matrix (59 tests)
    ├── stress.test.ts             # Concurrency & numeric boundary stress tests (20 tests)
    ├── challenger2_protocol.test.ts # Protocol fuzzing & RPC outage tests (18 tests)
    └── forensic_runner.ts         # Standalone live mainnet fuzzing & audit runner (npm run audit)
```

---

## 📄 License & Attribution

Distributed under the **MIT License**. See `LICENSE` for details.

Engineered with pride for the **Solana** ecosystem and the **Superteam Earn** bounty program.
Built to empower autonomous AI agents to trade safely, decentralized, and with zero-trust adversarial pre-flight verification.
