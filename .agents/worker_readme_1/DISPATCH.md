# Dispatch Assignment: Worker README & Superteam Earn Assets

## Working Directory
/Users/samaraldico/sol-inquisitor/.agents/worker_readme_1

## Objective
Author a comprehensive, publication-grade `/Users/samaraldico/sol-inquisitor/README.md` satisfying Requirement R5 and acceptance criteria:
"README.md contains the ASCII architecture diagram, setup instructions, and the 2-minute Loom script."

## Requirements to Include
1. Title, badges, and project overview of "Sol-Inquisitor" (`@solana-agent-kit/plugin-adversary`).
2. High-signal ASCII Architecture Diagram illustrating the pre-flight interception pipeline (Agent Proposal -> Inquisitor Plugin/MCP -> RugProbe [Freeze +45, Mint +35, Concentration] + MevGuard [Slippage Curves] + Pre-flight Simulation [Balance Deltas] -> Decision Gate [BLOCKED / APPROVED]).
3. Quick-Start Guide:
   - Installation (`npm install @solana-agent-kit/plugin-adversary`).
   - Building (`npm run build`).
   - Testing (`npm test`).
   - Running interactive showcase demo (`npm run demo`).
4. Solana Agent Kit V2 Plugin Integration Guide:
   - Full TypeScript code example creating `SolInquisitorPlugin`, querying actions, and integrating with an autonomous agent loop.
5. Model Context Protocol (MCP) Server Setup Guide:
   - Claude Desktop configuration snippet (`claude_desktop_config.json`) using stdio command `sol-inquisitor-mcp` or `node dist/mcp/server.js`.
   - Cursor / Antigravity configuration.
   - MCP tool documentation (`audit_solana_trade`, `probe_token_rug`, `assess_mev_risk`).
6. Security Engine Mathematical Specification:
   - Rug & Honeypot scoring weights (freeze +45, mint +35, whale concentration >=80% +30, >=50% +20, >=35% +10, threshold >=40).
   - Pre-flight RPC simulation & balance delta diffing ($M_{\text{min}} = E_{\text{out}} \times (1 - S_{\text{bps}} / 10000)$).
   - MEV sandwich vulnerability classification tiers (LOW, MEDIUM, HIGH, CRITICAL) and extractable value estimation.
   - Fail-secure fallback on RPC error (risk score 100, veto).
7. Word-for-Word 2-Minute Loom Demo Recording Script:
   - Timestamped script (0:00-0:20 Hook, 0:20-0:50 Live Honeypot Interception, 0:50-1:20 MEV Sandwich & Simulation Veto, 1:20-1:45 SAK V2 & Native MCP Integration, 1:45-2:00 Conclusion).
   - Clear sections for Screen/Visual Actions and exact Spoken Narration.

## File Ownership
- Exclusively owns: `/Users/samaraldico/sol-inquisitor/README.md`
- Do NOT edit other files.

## Inputs
- /Users/samaraldico/sol-inquisitor/.agents/ORIGINAL_REQUEST.md
- /Users/samaraldico/sol-inquisitor/.agents/orchestrator_1/PROJECT.md
- /Users/samaraldico/sol-inquisitor/src/cli/demo.ts
- /Users/samaraldico/sol-inquisitor/package.json

## MANDATORY INTEGRITY WARNING
DO NOT CHEAT. All implementations must be genuine. DO NOT hardcode test results, create dummy/facade implementations, or circumvent the intended task. A teamwork_preview_auditor will independently verify your work. Integrity violations WILL be detected and your work WILL be rejected.

## 2026-09-10T13:04:37Z

Author /Users/samaraldico/sol-inquisitor/README.md containing:
- Project title, badges, and overview of @solana-agent-kit/plugin-adversary ("Sol-Inquisitor")
- High-signal ASCII Architecture Diagram
- Quick-Start Guide (installation, build, test, demo)
- Solana Agent Kit V2 plugin integration guide with TypeScript code
- MCP Server setup guide (Claude Desktop, Cursor/Antigravity config)
- Security Engine mathematical & scoring specifications
- Complete, word-for-word 2-minute Loom demo recording script
Write your completion report to /Users/samaraldico/sol-inquisitor/.agents/worker_readme_1/handoff.md and report back via send_message.
