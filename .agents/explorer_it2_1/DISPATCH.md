# Dispatch Assignment: Iteration 2 Explorer 1 (Interface Validation & RugProbe Fix Strategy)

## Working Directory
/Users/samaraldico/sol-inquisitor/.agents/explorer_it2_1

## Objective
Analyze the Gate failure reported by Challenger 2 and Reviewers, and formulate the exact code fix strategy:
1. **Challenger 2 Failure Report**:
   - In `src/mcp/server.ts` (lines 159-172) and `src/plugin.ts` (lines 299-303), `assess_mev_risk` fails open when `maxSlippageBps` is omitted, malformed, or non-numeric, producing `NaN` and returning `riskLevel: 'LOW'`.
   - In `src/plugin.ts` (lines 276-280), `probe_token_rug` does not call `RugProbeInputSchema.parse(input)`.
   - In `src/modules/rugProbe.ts` (line 31), `new PublicKey(targetMintStr)` is outside `try/catch`, throwing uncaught error on invalid base58 characters.
2. **Reviewer 1 & 2 Findings**:
   - `README.md` test count badge shows 22/22 from early milestone; should reflect the complete 100-test suite.
3. Formulate the exact line-by-line diff recommendations for:
   - `src/mcp/server.ts`
   - `src/plugin.ts`
   - `src/modules/rugProbe.ts`
   - `README.md`
4. Do NOT modify any code files directly.

## Inputs
- /Users/samaraldico/sol-inquisitor/.agents/ORIGINAL_REQUEST.md
- /Users/samaraldico/sol-inquisitor/.agents/orchestrator_1/PROJECT.md
- /Users/samaraldico/sol-inquisitor/.agents/challenger_2/handoff.md
- /Users/samaraldico/sol-inquisitor/.agents/reviewer_1/handoff.md
- /Users/samaraldico/sol-inquisitor/.agents/reviewer_2/handoff.md

## Output
Write your fix strategy report to `/Users/samaraldico/sol-inquisitor/.agents/explorer_it2_1/handoff.md` and report back via send_message.
