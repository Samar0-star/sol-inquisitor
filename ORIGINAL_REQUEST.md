# Original User Request

## 2026-09-10T12:55:53Z

Build, test, and package "Sol-Inquisitor" (@solana-agent-kit/plugin-adversary), a production-grade open-source Solana Agent Kit plugin and native Model Context Protocol (MCP) server that intercepts autonomous agent transaction proposals, tests them adversarially for honeypots, MEV sandwich exposure, and pre-flight balance deltas, and vetoes unsafe transactions before signing.

Working directory: /Users/samaraldico/sol-inquisitor
Integrity mode: development

## Requirements

### R1. Adversarial Rug & Honeypot Falsification Engine
Inspect target token mints on Solana to detect and veto honeypots and rug hazards. Check freeze authority (assign +45 risk if present) and mint authority (assign +35 risk if present) via @solana/spl-token. Analyze circulating supply concentration among top holders. If total risk score meets or exceeds 40, flag the token as UNSAFE and reject trade proposals.

### R2. Pre-Flight RPC Simulation & Balance Delta Diffing
Simulate proposed trade transactions using connection.simulateTransaction() to falsify execution against ledger state. Verify that the simulated post-balance delta meets or exceeds the minimum acceptable output given the specified maximum slippage tolerance. If simulation reverts or the balance delta violates slippage boundaries, veto the transaction.

### R3. MEV Sandwich Stress Guard
Stress-test trade slippage curves to protect autonomous agents against predatory frontrunning and Jito MEV sandwich attacks. Score sandwich vulnerability based on slippage tolerance (LOW, MEDIUM, HIGH, CRITICAL) and provide recommended safe slippage boundaries.

### R4. Solana Agent Kit V2 Plugin & Native MCP Server
Expose the falsification engine as a standard Solana Agent Kit V2 plugin with callable actions (audit_trade_proposal, probe_token_rug, assess_mev_risk). Provide a native Model Context Protocol (MCP) stdio server exposing the audit_solana_trade tool for seamless integration into Claude, Cursor, and Antigravity.

### R5. Interactive CLI Showcase & Superteam Earn Submission Assets
Provide an interactive terminal demo (npm run demo) demonstrating live trade interception (defending against a honeypot with active freeze/mint authorities vs approving a verified decentralized trade). Include a comprehensive README with an ASCII architecture diagram, quick-start guide, and a word-for-word 2-minute Loom demo recording script.

## Acceptance Criteria

### Automated Testing & Compilation
- [ ] TypeScript compiles cleanly in strict mode ("strict": true, npm run build) with zero type errors.
- [ ] 100% of Jest unit tests pass with zero external network dependency (npm test).
- [ ] Simulation tests verify balance delta calculation, slippage violation vetoes, and simulation revert vetoes.
- [ ] Rug probe tests verify freeze authority (+45) and mint authority (+35) rejection.

### Functional Integration & Delivery
- [ ] MCP stdio server initializes properly and responds to tool listing for audit_solana_trade.
- [ ] CLI demo executes cleanly via npm run demo without runtime exceptions and prints structured pre-flight audit reports.
- [ ] README.md contains the ASCII architecture diagram, setup instructions, and the 2-minute Loom script.
