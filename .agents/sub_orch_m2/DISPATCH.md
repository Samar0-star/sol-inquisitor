# Dispatch Assignment: Sub-Orchestrator for Milestone 2 (README & Submission Assets)

## Working Directory
/Users/samaraldico/sol-inquisitor/.agents/sub_orch_m2

## Parent
Conversation ID: 4e9f37f5-7876-4493-bd17-5aa5bc47f7c2

## Scope & Objective
Milestone 2: Superteam Earn Submission Assets & Documentation.
Author a comprehensive, publication-grade `README.md` at `/Users/samaraldico/sol-inquisitor/README.md` satisfying Requirement R5 and acceptance criteria:
"README.md contains the ASCII architecture diagram, setup instructions, and the 2-minute Loom script."

Required sections in `README.md`:
1. Title, badges, and executive overview of "Sol-Inquisitor" (`@solana-agent-kit/plugin-adversary`).
2. High-signal ASCII Architecture Diagram illustrating the pre-flight interception pipeline (Agent Proposal -> Inquisitor Plugin/MCP -> RugProbe [Freeze +45, Mint +35, Concentration] + MevGuard [Slippage Curves] + Pre-flight Simulation [Balance Deltas] -> Decision Gate [BLOCKED / APPROVED]).
3. Quick-Start Guide:
   - Installation (`npm install @solana-agent-kit/plugin-adversary` or git clone).
   - Build & Test instructions (`npm run build`, `npm test`, `npm run demo`).
4. Solana Agent Kit V2 Plugin Integration Guide:
   - Typescript example showing instantiation and registering with Solana Agent Kit.
   - Example calling `audit_trade_proposal`, `probe_token_rug`, `assess_mev_risk`.
5. Model Context Protocol (MCP) Server Setup Guide:
   - Configuration for Claude Desktop (`claude_desktop_config.json`) with `npx sol-inquisitor-mcp` or `node dist/mcp/server.js`.
   - Configuration for Cursor / Antigravity.
   - Available MCP tools (`audit_solana_trade`, `probe_token_rug`, `assess_mev_risk`).
6. Core Mathematical & Security Falsification Engine Specification:
   - Rug & Honeypot scoring weights and threshold (freeze +45, mint +35, concentration >=80% +30, >=50% +20, >=35% +10, threshold >=40).
   - Simulation balance delta diffing formula ($M_{\text{min}} = E_{\text{out}} \times (1 - S_{\text{bps}} / 10000)$).
   - MEV sandwich risk classification tiers (LOW, MEDIUM, HIGH, CRITICAL).
7. Word-for-Word 2-Minute Loom Demo Recording Script:
   - Full script broken down by timestamp (0:00-0:20 Hook, 0:20-0:50 Live Honeypot Interception, 0:50-1:20 MEV & Simulation Veto, 1:20-1:45 MCP & Agent Kit Integration, 1:45-2:00 Conclusion).
   - Exact spoken narration, screen actions, visual cues, and terminal command outputs.

## File Ownership
- Exclusively owns: `/Users/samaraldico/sol-inquisitor/README.md`

## Inputs to Read
- /Users/samaraldico/sol-inquisitor/.agents/ORIGINAL_REQUEST.md
- /Users/samaraldico/sol-inquisitor/.agents/orchestrator_1/PROJECT.md
- /Users/samaraldico/sol-inquisitor/src/cli/demo.ts
- /Users/samaraldico/sol-inquisitor/package.json

## Execution Pattern
You are a Sub-Orchestrator. Run the iteration loop:
1. Explorer -> Worker -> Reviewer -> Challenger -> Auditor -> Gate check.
2. Record verdicts in `GATE_STATUS.md`.
3. Report completion and handoff to parent.
