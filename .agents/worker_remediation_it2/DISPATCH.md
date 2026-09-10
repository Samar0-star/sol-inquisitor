# Dispatch Assignment: Worker Remediation (Iteration 2)

## Working Directory
/Users/samaraldico/sol-inquisitor/.agents/worker_remediation_it2

## Objective
Implement the 6-point remediation plan formulated by Explorers 1, 2, and 3 to resolve Challenger 2's interface findings, eliminate all fail-open risks, synchronize test assertions, and update documentation:

1. **`src/types.ts`**:
   - Add `required_error` and `invalid_type_error` to `TradeProposalSchema.targetMint` and `RugProbeInputSchema.targetMint`:
     ```typescript
     targetMint: z
       .string({
         required_error: 'Target mint must be a valid Solana base58 address',
         invalid_type_error: 'Target mint must be a valid Solana base58 address',
       })
       .regex(/^[1-9A-HJ-NP-Za-km-z]{32,44}$/, 'Target mint must be a valid Solana base58 address')
     ```
2. **`src/mcp/server.ts`**:
   - In `assess_mev_risk`, parse incoming arguments via `MevGuardInputSchema.parse(...)`.
   - In `probe_token_rug`, parse incoming arguments via `RugProbeInputSchema.parse(args)`.
   - In `audit_solana_trade`, ensure `TradeProposalSchema.parse(...)` handles arguments.
3. **`src/plugin.ts`**:
   - In `probe_token_rug` action handler, call `const validated = RugProbeInputSchema.parse(input); return await this.probeRug(validated.targetMint);`.
   - In `assess_mev_risk` action handler, call `const validated = MevGuardInputSchema.parse(input); return this.assessMev(validated.maxSlippageBps, validated.expectedOutput);`.
4. **`src/modules/rugProbe.ts`**:
   - Move `const mintPubkey = new PublicKey(targetMintStr);` inside the `try { ... }` block (line 45).
5. **`tests/challenger2_protocol.test.ts`**:
   - Synchronize tests 1.5, 2.3, and 2.4 to assert the remediated secure behavior:
     - Test 1.5: expect `resMissing.isError` to be `true`, `resNeg.isError` to be `true`, `resStr.isError` to be `true`.
     - Test 2.3: expect `rugAction.handler(null, {} as any)` to reject with `ZodError` (instead of `TypeError`).
     - Test 2.4: expect `mevAction.handler(null, { maxSlippageBps: -100 } as any)` and `mevAction.handler(null, {} as any)` to reject with `ZodError`.
6. **Documentation & Assets**:
   - Create `.env.example` in repository root.
   - Create `LICENSE` (MIT) in repository root.
   - Update `README.md` test count badge and table to reflect 100/100 official tests (and 138 total passing tests).
   - Update Loom narration text in `README.md` line 447.

## Verification
- Run `npm run build`: 0 errors in strict mode.
- Run `npm test`: all 7 test suites pass (138/138 tests pass).
- Run `npm run demo`: clean execution across all 3 scenarios.

## MANDATORY INTEGRITY WARNING
DO NOT CHEAT. All implementations must be genuine. DO NOT hardcode test results, create dummy/facade implementations, or circumvent the intended task. A teamwork_preview_auditor will independently verify your work. Integrity violations WILL be detected and your work WILL be rejected.

## Inputs to Read
- /Users/samaraldico/sol-inquisitor/.agents/ORIGINAL_REQUEST.md
- /Users/samaraldico/sol-inquisitor/.agents/orchestrator_1/PROJECT.md
- /Users/samaraldico/sol-inquisitor/.agents/explorer_it2_1/handoff.md
- /Users/samaraldico/sol-inquisitor/.agents/explorer_it2_2/handoff.md
- /Users/samaraldico/sol-inquisitor/.agents/explorer_it2_3/handoff.md
- /Users/samaraldico/sol-inquisitor/.agents/challenger_2/handoff.md

## Output
Write report to `/Users/samaraldico/sol-inquisitor/.agents/worker_remediation_it2/handoff.md`. Report back via send_message.

## 2026-09-10T13:22:13Z
You are Worker Remediation Iteration 2.
Your working directory is /Users/samaraldico/sol-inquisitor/.agents/worker_remediation_it2.
Read your dispatch at /Users/samaraldico/sol-inquisitor/.agents/worker_remediation_it2/DISPATCH.md.
Read /Users/samaraldico/sol-inquisitor/.agents/ORIGINAL_REQUEST.md and /Users/samaraldico/sol-inquisitor/.agents/orchestrator_1/PROJECT.md.
Read the handoff reports from Iteration 2 Explorers at:
- /Users/samaraldico/sol-inquisitor/.agents/explorer_it2_1/handoff.md
- /Users/samaraldico/sol-inquisitor/.agents/explorer_it2_2/handoff.md
- /Users/samaraldico/sol-inquisitor/.agents/explorer_it2_3/handoff.md

MANDATORY INTEGRITY WARNING:
DO NOT CHEAT. All implementations must be genuine. DO NOT hardcode test results, create dummy/facade implementations, or circumvent the intended task. A teamwork_preview_auditor will independently verify your work. Integrity violations WILL be detected and your work WILL be rejected.

Implement the 6-point remediation plan:
1. Update `src/types.ts`: add required_error and Base58 regex to TradeProposalSchema and RugProbeInputSchema targetMint.
2. Update `src/mcp/server.ts`: enforce MevGuardInputSchema, RugProbeInputSchema, and TradeProposalSchema validation.
3. Update `src/plugin.ts`: call RugProbeInputSchema.parse and MevGuardInputSchema.parse in action handlers.
4. Update `src/modules/rugProbe.ts`: move PublicKey instantiation inside try block.
5. Update `tests/challenger2_protocol.test.ts`: synchronize tests 1.5, 2.3, and 2.4 to assert remediated secure behavior (isError: true and ZodError).
6. Create `.env.example` and `LICENSE`, update `README.md` test counts to 100/100 official (138 total).

Run `npm run build`, `npm test`, and `npm run demo` to verify everything compiles cleanly and all 138 tests pass.
Write your completion report to /Users/samaraldico/sol-inquisitor/.agents/worker_remediation_it2/handoff.md and report back via send_message.

