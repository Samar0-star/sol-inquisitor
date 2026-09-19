---
name: sol-inquisitor
description: Adversarial pre-flight security firewall and transaction falsification engine for Solana AI Agent Wallets via Model Context Protocol (MCP)
version: 1.0.0
author: Samar0-star
license: MIT
tools:
  - audit_solana_trade
  - probe_token_rug
  - assess_mev_risk
---

# 🛡️ Sol-Inquisitor: Mermail Agent Wallet Security Skill

`sol-inquisitor` is an autonomous pre-flight security skill for AI agents operating on Solana. Before an agent signs or executes any token swap or transfer through its **Agent Wallet** or **Mermail Inbox**, `sol-inquisitor` inspects the cryptographic ledger state, checks mint and freeze authorities, and simulates execution to prevent honeypot rugs and predatory MEV sandwich attacks.

---

## 1. What This Skill Enables

Autonomous AI agents on Solana are vulnerable to adversarial counter-parties:
* **Honeypot Tokens**: Deployers retain unrevoked freeze authorities or mint keys to blacklist agent wallets or dilute liquidity post-swap.
* **MEV Sandwich Exploits**: Searcher bots detect high slippage on decentralized swaps, front-running and back-running the agent's trade via Jito bundles.
* **Execution Divergence**: Unhandled smart contract reverts and hidden transfer taxes drain agent balances.

`sol-inquisitor` acts as an automated security gatekeeper. An agent calls this skill **before signing** any transaction. If the risk score meets or exceeds threshold ($\ge 40$), the trade is blocked with an actionable diagnostic report.

---

## 2. Interaction With Mermail & MCP

This skill exposes three core Model Context Protocol (MCP) tools that seamlessly integrate with Mermail's Agent Wallet loop:

1. `audit_solana_trade`: Full end-to-end audit (RugProbe + MevGuard + Pre-flight Simulation).
2. `probe_token_rug`: Fast cryptographic audit of token freeze authority, mint authority, and holder concentration.
3. `assess_mev_risk`: Evaluates slippage tolerance against pool liquidity to prevent Jito sandwiching.

---

## 3. Mermail & Agent Wallet Policy Compliance

Sol-Inquisitor strictly adheres to Mermail and Model Context Protocol wallet security principles:

1. **Zero Private Key Exposure**: The LLM agent planner and MCP tools operate strictly on transaction parameters (`targetMint`, `expectedOutput`, `maxSlippageBps`) or unsigned serialized transactions. No private keys or seed phrases ever enter the model context window.
2. **Delegated Execution Guardrails**: Mermail Agent Wallets configure Sol-Inquisitor as a mandatory pre-signing check. Any transaction proposal receiving a `BLOCKED` decision is deterministically rejected before reaching wallet signing routines.
3. **Deterministic Pre-Flight Veto**:
   - **Freeze Authority Present**: +45 risk score $\rightarrow$ Hard Veto.
   - **Mint Authority Present**: +35 risk score.
   - **Whale Concentration ($\ge 80\%$)**: +30 risk score.
   - **Slippage $>500$ bps (Critical MEV Sandwich)**: +95 risk score $\rightarrow$ Hard Veto.
   - **Simulation Revert or Balance Delta Deficit**: Hard Veto.

---

## 4. MCP Server Configuration

Add Sol-Inquisitor to your agent runner's MCP configuration (`claude_desktop_config.json`, Cursor MCP, or Antigravity MCP settings):

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

Or run directly from source via `ts-node`:

```json
{
  "mcpServers": {
    "sol-inquisitor": {
      "command": "npx",
      "args": ["ts-node", "/Users/samaraldico/sol-inquisitor/src/mcp/server.ts"],
      "env": {
        "SOLANA_RPC_URL": "https://api.mainnet-beta.solana.com"
      }
    }
  }
}
```

---

## 5. Formal Model Context Protocol (MCP) Tool Schemas

### Tool 1: `audit_solana_trade`

Adversarially falsifies and audits a proposed Solana trade before signing. Detects honeypots, freeze authorities (+45 risk), mint authorities (+35 risk), whale concentration, MEV sandwich risk, and pre-flight balance delta violations. Returns `APPROVED` or `BLOCKED`.

```json
{
  "name": "audit_solana_trade",
  "description": "Adversarially falsifies and audits a proposed Solana trade before signing. Detects honeypots, freeze authorities (+45 risk), mint authorities (+35 risk), whale concentration, MEV sandwich risk, and pre-flight balance delta violations. Returns APPROVED or BLOCKED.",
  "inputSchema": {
    "type": "object",
    "properties": {
      "targetMint": {
        "type": "string",
        "description": "Solana token mint base58 address"
      },
      "expectedOutput": {
        "type": "number",
        "description": "Expected output token quantity"
      },
      "maxSlippageBps": {
        "type": "number",
        "description": "Maximum tolerated slippage in basis points (100 = 1%)",
        "default": 100
      },
      "walletPublicKey": {
        "type": "string",
        "description": "Optional public key of the trader/agent wallet"
      },
      "transactionBase64": {
        "type": "string",
        "description": "Optional base64 serialized transaction for RPC balance delta simulation"
      },
      "rpcUrl": {
        "type": "string",
        "description": "Optional custom Solana RPC URL"
      }
    },
    "required": ["targetMint", "expectedOutput"]
  }
}
```

### Tool 2: `probe_token_rug`

Deeply inspects a Solana token mint for unrevoked freeze authority (+45 risk), mint authority (+35 risk), and whale concentration. Returns risk score and honeypot flags.

```json
{
  "name": "probe_token_rug",
  "description": "Deeply inspects a Solana token mint for unrevoked freeze authority (+45 risk), mint authority (+35 risk), and whale concentration. Returns risk score and honeypot flags.",
  "inputSchema": {
    "type": "object",
    "properties": {
      "targetMint": {
        "type": "string",
        "description": "Solana token mint address to probe"
      }
    },
    "required": ["targetMint"]
  }
}
```

### Tool 3: `assess_mev_risk`

Stress-tests trade slippage settings to protect against predatory MEV sandwich bots on Solana.

```json
{
  "name": "assess_mev_risk",
  "description": "Stress-tests trade slippage settings to protect against predatory MEV sandwich bots on Solana.",
  "inputSchema": {
    "type": "object",
    "properties": {
      "maxSlippageBps": {
        "type": "number",
        "description": "Slippage in basis points (e.g. 100 = 1%)"
      },
      "expectedOutput": {
        "type": "number",
        "description": "Expected token output quantity"
      }
    },
    "required": ["maxSlippageBps"]
  }
}
```

---

## 6. Pre-Flight Workflow Architecture

```
[Agent Receives Trade / Payment Intent via Mermail Inbox]
                       │
                       ▼
    [Invoke MCP Tool: audit_solana_trade]
    • Target Mint Address
    • Expected Token Output
    • Slippage Tolerance (bps)
                       │
                       ▼
    ┌──────────────────┴──────────────────┐
    ▼                                     ▼
[1. Cryptographic Authority Probe]    [2. Pre-Flight Ledger Simulation]
• Freeze Authority: +45 Risk          • Balance Delta Diffing
• Mint Authority:   +35 Risk          • Hidden Tax Detection
• Whale Top 5:      +30 Risk          • Execution Revert Interception
    │                                     │
    └──────────────────┬──────────────────┘
                       ▼
          [3. MEV Sandwich Risk Scorer]
          • Slippage Tier Clamping
          • Sandwich Vulnerability Check
                       │
                       ▼
         [Deterministic Decision Gate]
         • Overall Risk Score: 0 to 100
                       │
       ┌───────────────┴───────────────┐
       ▼                               ▼
[Score >= 40: BLOCKED]       [Score < 40: APPROVED]
• Returns forensic diagnostic • Authorizes Mermail Agent Wallet
• Aborts wallet signature     • Signs & broadcasts transaction
```

---

## 7. Example Prompts & Structured Outputs

### Example 1: Auditing a Malicious Honeypot Token
**Agent Prompt:**
> "Audit the proposed swap of 1 SOL for token `EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v` with 100 bps slippage before I sign."

**Tool Invocation:**
```json
{
  "name": "audit_solana_trade",
  "arguments": {
    "targetMint": "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
    "expectedOutput": 1000000,
    "maxSlippageBps": 100
  }
}
```

**Skill Response:**
```json
{
  "decision": "BLOCKED",
  "verdict": "VETO: Target token freeze authority is active (+45 risk). Immediate blacklist hazard.",
  "overallRiskScore": 80,
  "timestamp": 1726747200000,
  "targetMint": "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
  "breakdown": {
    "rugProbe": {
      "mint": "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
      "hasFreezeAuthority": true,
      "freezeAuthority": "7dGbdsqrnFT56PzkHkCq3tTcL1K6pY478s7iR3g6A5b",
      "hasMintAuthority": true,
      "totalRiskScore": 80,
      "isUnsafe": true,
      "reasons": [
        "Unrevoked freeze authority detected (+45 risk score)",
        "Unrevoked mint authority detected (+35 risk score)"
      ]
    },
    "simulation": null,
    "mevGuard": {
      "slippageBps": 100,
      "mevRiskScore": 15,
      "riskLevel": "LOW",
      "sandwichVulnerability": false,
      "estimatedExtractableValueBps": 70,
      "recommendedMaxSlippageBps": 100,
      "reasons": ["Slippage within acceptable bounds (1.00%)."]
    }
  },
  "vetoReasons": [
    "Target token has an active, unrevoked freeze authority. Risk of token account freezing.",
    "Target token has an active, unrevoked mint authority."
  ],
  "recommendations": [
    "Abort trade proposal immediately.",
    "Do not sign transaction with Agent Wallet."
  ]
}
```

### Example 2: Auditing a Clean Token ($BONK)
**Tool Invocation:**
```json
{
  "name": "audit_solana_trade",
  "arguments": {
    "targetMint": "DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263",
    "expectedOutput": 5000000,
    "maxSlippageBps": 50
  }
}
```

**Skill Response:**
```json
{
  "decision": "APPROVED",
  "verdict": "PASSED: Transaction proposal cleared all adversarial pre-flight checks.",
  "overallRiskScore": 5,
  "timestamp": 1726747200000,
  "targetMint": "DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263",
  "breakdown": {
    "rugProbe": {
      "mint": "DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263",
      "hasFreezeAuthority": false,
      "hasMintAuthority": false,
      "totalRiskScore": 0,
      "isUnsafe": false,
      "reasons": []
    },
    "simulation": null,
    "mevGuard": {
      "slippageBps": 50,
      "mevRiskScore": 5,
      "riskLevel": "LOW",
      "sandwichVulnerability": false,
      "estimatedExtractableValueBps": 20,
      "recommendedMaxSlippageBps": 100,
      "reasons": ["Slippage tolerance is low (0.50%). MEV risk minimal."]
    }
  },
  "vetoReasons": [],
  "recommendations": [
    "Proceed with Agent Wallet transaction signature."
  ]
}
```

---

## 8. Verification & Testing

The skill and its underlying MCP tools are verified by **138 automated unit tests** across 7 suites executing in < 3 seconds:

```bash
cd /Users/samaraldico/sol-inquisitor
npm test
```
