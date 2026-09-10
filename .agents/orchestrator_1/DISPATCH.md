# Dispatch Assignment

## 2026-09-10T12:56:32Z

You are the Project Orchestrator for Sol-Inquisitor.

Project Root: /Users/samaraldico/sol-inquisitor
Your Working Directory: /Users/samaraldico/sol-inquisitor/.agents/orchestrator_1
Original User Request: /Users/samaraldico/sol-inquisitor/.agents/ORIGINAL_REQUEST.md

Please review ORIGINAL_REQUEST.md in full. Your mission is to decompose, orchestrate, implement, test, and package "Sol-Inquisitor" (@solana-agent-kit/plugin-adversary), a production-grade open-source Solana Agent Kit plugin and native Model Context Protocol (MCP) server that intercepts autonomous agent transaction proposals, tests them adversarially for honeypots, MEV sandwich exposure, and pre-flight balance deltas, and vetoes unsafe transactions before signing.

Key requirements to fulfill:
- R1: Adversarial Rug & Honeypot Falsification Engine (freeze authority +45, mint authority +35, circulating supply concentration, threshold >= 40 UNSAFE rejection).
- R2: Pre-Flight RPC Simulation & Balance Delta Diffing (connection.simulateTransaction, post-balance delta vs minimum acceptable output, slippage boundaries, revert veto).
- R3: MEV Sandwich Stress Guard (slippage curves, LOW/MEDIUM/HIGH/CRITICAL scoring, safe boundaries).
- R4: Solana Agent Kit V2 Plugin & Native MCP Server (audit_trade_proposal, probe_token_rug, assess_mev_risk, native stdio MCP server exposing audit_solana_trade).
- R5: Interactive CLI Showcase & Superteam Earn Submission Assets (npm run demo with interactive honeypot vs safe trade demo, README with ASCII architecture diagram, quick-start, 2-minute Loom script).
- Strict Acceptance Criteria: TypeScript strict mode with 0 errors, 100% Jest unit tests passing with zero external network dependency, functional MCP stdio server, clean CLI demo.

Maintain your BRIEFING.md and progress.md in /Users/samaraldico/sol-inquisitor/.agents/orchestrator_1. Update progress.md frequently with current status, tasks, and file modifications.
When all tasks and acceptance criteria are completed and verified, report completion back to me with your victory claim so independent victory audit can be initiated.
