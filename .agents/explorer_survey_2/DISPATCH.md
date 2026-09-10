# Dispatch Assignment: Survey Explorer 2 (Feature Inventory & Requirements Architecture)

## Working Directory
/Users/samaraldico/sol-inquisitor/.agents/explorer_survey_2

## Objective
Analyze ORIGINAL_REQUEST.md in complete detail and map all required features, interfaces, data structures, and mathematical formulas:
1. R1: Honeypot & Rug Falsification Engine (freeze authority +45, mint authority +35, circulating supply concentration, >=40 UNSAFE rejection rule).
2. R2: Pre-Flight RPC Simulation & Balance Delta Diffing (connection.simulateTransaction, post-balance delta vs minimum acceptable output, slippage boundaries, revert veto).
3. R3: MEV Sandwich Stress Guard (slippage curves, LOW/MEDIUM/HIGH/CRITICAL scoring, safe boundaries).
4. R4: Solana Agent Kit V2 Plugin & Native MCP Server (audit_trade_proposal, probe_token_rug, assess_mev_risk, native stdio MCP server exposing audit_solana_trade).
5. R5: Interactive CLI Showcase & Superteam Earn Submission Assets (npm run demo with interactive honeypot vs safe trade demo, README with ASCII architecture diagram, quick-start, 2-minute Loom script).
6. Detail the exact type contracts, inputs, outputs, scoring rules, and error conditions.

## Inputs
- /Users/samaraldico/sol-inquisitor/.agents/ORIGINAL_REQUEST.md

## Output
Write your comprehensive survey report to `/Users/samaraldico/sol-inquisitor/.agents/explorer_survey_2/handoff.md`. Include a detailed feature enumeration, algorithmic logic, data structures, and proposed module boundaries.
Do NOT modify any code files.

## 2026-09-10T12:57:47Z
User Request:
You are Survey Explorer 2.
Your working directory is /Users/samaraldico/sol-inquisitor/.agents/explorer_survey_2.
Read your task assignment at /Users/samaraldico/sol-inquisitor/.agents/explorer_survey_2/DISPATCH.md.
Also read /Users/samaraldico/sol-inquisitor/.agents/ORIGINAL_REQUEST.md.
Analyze all requirements (R1, R2, R3, R4, R5) and map out:
- Feature inventory and mathematical rules (freeze +45, mint +35, concentration, >=40 rejection, balance delta calculation, slippage veto, MEV risk levels LOW/MEDIUM/HIGH/CRITICAL).
- Core architectural components and module boundaries.
- Error conditions and veto triggers.
- Do NOT modify any code.
Write your complete report to /Users/samaraldico/sol-inquisitor/.agents/explorer_survey_2/handoff.md and report back via send_message.
