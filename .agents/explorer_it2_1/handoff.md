# Handoff Report: Interface Vulnerabilities & Documentation Remediation Strategy

**Agent**: Iteration 2 Explorer 1  
**Working Directory**: `/Users/samaraldico/sol-inquisitor/.agents/explorer_it2_1`  
**Target Repository**: `/Users/samaraldico/sol-inquisitor`  
**Date**: 2026-09-10T13:25:00Z  
**Verdict**: **REMEDIATION STRATEGY FORMULATED (Ready for Implementer)**  

---

## 1. Observation

### Observation 1: Fail-Open Vulnerability in `assess_mev_risk` (MCP & SAK V2)
In `src/mcp/server.ts` (lines 159–172):
```typescript
if (name === 'assess_mev_risk') {
  const maxSlippageBps = Number(args?.maxSlippageBps);
  const expectedOutput = args?.expectedOutput !== undefined ? Number(args.expectedOutput) : undefined;
  const mevReport = inquisitor.assessMev(maxSlippageBps, expectedOutput);

  return {
    content: [
      {
        type: 'text',
        text: JSON.stringify(mevReport, null, 2),
      },
    ],
  };
}
```
And in `src/plugin.ts` (lines 299–303):
```typescript
schema: MevGuardInputSchema,
handler: async (_agent: unknown, input: { maxSlippageBps: number; expectedOutput?: number }) => {
  return this.assessMev(input.maxSlippageBps, input.expectedOutput);
},
```
And in `src/modules/mevGuard.ts` (lines 9–55):
```typescript
export function assessMevRisk(input: MevGuardInput): MevRiskReport {
  const { maxSlippageBps, tradeSizeUsd } = input;
  ...
  if (maxSlippageBps > 500) { ... }
  else if (maxSlippageBps > 300) { ... }
  else if (maxSlippageBps > 150) { ... }
  else if (maxSlippageBps > 50) { ... }
  else {
    mevRiskScore = 5;
    riskLevel = 'LOW';
    sandwichVulnerability = false;
    reasons.push(`Tight slippage tolerance (${(maxSlippageBps / 100).toFixed(2)}%). Strong protection against sandwich attacks.`);
  }
```
- **Empirical Execution**:
  When `assess_mev_risk` is invoked over MCP with `{}` or negative/string slippage:
  `Number(undefined)` yields `NaN`. All comparisons (`NaN > 500`, `NaN > 300`, `NaN > 150`, `NaN > 50`) evaluate to `false`. Execution falls into the `else` branch, setting `mevRiskScore = 5`, `riskLevel = 'LOW'`, and reason `"Tight slippage tolerance (NaN%)"`.
  The MCP server returns this report with `isError: undefined` (falsy) instead of rejecting the call with `isError: true`.
  In SAK V2, `handler(null, {})` and `handler(null, { maxSlippageBps: -100 })` do not invoke `MevGuardInputSchema.parse(input)`, silently certifying invalid inputs as `LOW` risk.

---

### Observation 2: Zod Schema Bypass in SAK V2 `probe_token_rug` Action Handler
In `src/plugin.ts` (lines 276–280):
```typescript
schema: RugProbeInputSchema,
handler: async (_agent: unknown, input: { targetMint: string }) => {
  return await this.probeRug(input.targetMint);
},
```
- **Empirical Execution**:
  When invoked directly with an empty object `{}`:
  ```bash
  $ npx ts-node -e "
  const { SolInquisitorPlugin } = require('./src/plugin');
  const p = new SolInquisitorPlugin();
  const a = p.actions.find(x => x.name === 'probe_token_rug');
  a.handler(null, {}).catch(err => console.log(err.name, err.message));
  "
  ```
  **Output**: `TypeError Cannot read properties of undefined (reading '_bn')`.
  `input.targetMint` is `undefined`. It bypasses `RugProbeInputSchema.parse(input)` and passes `undefined` into `@solana/web3.js`'s `PublicKey` constructor, throwing a runtime `TypeError` rather than a structured `ZodError` validation rejection before business logic execution.

---

### Observation 3: Synchronous Uncaught Exception in `probeRugRisks`
In `src/modules/rugProbe.ts` (lines 22–45):
```typescript
export async function probeRugRisks(
  connection: Connection,
  targetMintStr: string,
  options: RugProbeOptions = {}
): Promise<RugRiskReport> {
  const freezeWeight = options.freezeScoreWeight ?? 45;
  const mintWeight = options.mintScoreWeight ?? 35;
  const threshold = options.threshold ?? 40;

  const mintPubkey = new PublicKey(targetMintStr); // Line 31: OUTSIDE try/catch
  const reasons: string[] = [];
  ...
  // 1. Inspect Mint Account
  try {
    const mintInfo = ...
```
- **Empirical Execution**:
  When `plugin.auditTradeProposal({ targetMint: '0'.repeat(32), expectedOutput: 1000, maxSlippageBps: 100 })` is invoked:
  `TradeProposalSchema.parse` passes because `'0'.repeat(32)` has length 32 (`min(32).max(44)`).
  Then line 31 calls `new PublicKey('0'.repeat(32))`. Because `'0'` is an illegal base58 character on Solana, `new PublicKey` throws `Error: Non-base58 character`.
  Because line 31 is placed **before** the `try { ... } catch (err)` block on line 45, the exception is uncaught by the fail-secure handler. It causes `auditTradeProposal` to reject with an unhandled exception instead of generating a fail-secure `RugRiskReport` (`isUnsafe: true, totalRiskScore: 100`) and returning an audit report with `decision: 'BLOCKED'`.

---

### Observation 4: Dual Contract Requirement for Invalid Public Keys in MCP
In `tests/mcp.test.ts` (lines 531–540):
```typescript
test('returns isError: true when probe_token_rug receives invalid base58 public key', async () => {
  const result = (await client.callTool({
    name: 'probe_token_rug',
    arguments: { targetMint: 'not-a-valid-base58-key-address!' },
  })) as any;

  expect(result.isError).toBe(true);
  expect(result.content[0].text).toContain('Sol-Inquisitor Error');
});
```
And in `tests/challenger2_protocol.test.ts` (lines 125–169):
- Test 1.3 asserts that MCP tool `audit_solana_trade` returns `isError: true` when `targetMint` is `'0'.repeat(32)`.
- Test 1.4 asserts that MCP tool `probe_token_rug` returns `isError: true` when `targetMint` is `'0'.repeat(32)` or `'invalid!base58*chars#in$string'`.
Therefore, in MCP server (`src/mcp/server.ts`), input validation must ensure that malformed public keys result in `{ isError: true }`, while direct engine callers (`plugin.auditTradeProposal`) receive a fail-secure `decision: 'BLOCKED'` report without unhandled crashes.

---

### Observation 5: README.md Test Metrics Discrepancy
In `README.md`:
- Line 8: `[![Tests: 22/22 Passing](https://img.shields.io/badge/Tests-22%2F22%20Passing-brightgreen.svg)](tests/)`
- Line 155: `All 22 unit tests execute in under 2 seconds...`
- Line 447: `"It features a complete test suite of twenty-two tests..."`
- Lines 456–463: Verification table only lists 4 suites and 22/22 tests, omitting `tests/e2e.test.ts` (59 tests) and expanded `tests/mcp.test.ts` (24 tests), where the current repository maintains 5 core suites with 100 tests (and 7 suites with 138 tests total).

---

## 2. Logic Chain

1. **Premise 1 (Interface Integrity)**: In an autonomous agent architecture (SAK V2 and MCP), tools and actions must reject missing or malformed inputs strictly at the boundary using Zod schemas before internal business logic is executed.
2. **Inference from Observation 1**: Because `src/mcp/server.ts` and `src/plugin.ts` did not call `MevGuardInputSchema.parse()`, invalid inputs (`{}`, negative slippage, non-numeric strings) resulted in `NaN`, which bypassed all thresholds and produced false-safe `LOW` risk reports (`fail-open`). Applying `MevGuardInputSchema.parse()` restores strict validation, throwing `ZodError` and returning `{ isError: true }` in MCP and rejecting with `ZodError` in SAK V2.
3. **Inference from Observation 2**: Because `src/plugin.ts` did not invoke `RugProbeInputSchema.parse(input)` in `probe_token_rug`, passing `{}` resulted in `undefined` entering `@solana/web3.js`, throwing an unhandled `TypeError`. Adding `const validated = RugProbeInputSchema.parse(input)` guarantees that only validated inputs with 32–44 characters proceed, throwing `ZodError` immediately on empty or malformed inputs.
4. **Inference from Observation 3**: Because `const mintPubkey = new PublicKey(targetMintStr);` was placed at line 31 outside `try/catch` in `src/modules/rugProbe.ts`, any string that passes Zod length checks but contains non-base58 characters (e.g. `'0'.repeat(32)`) crashes `auditTradeProposal` with an uncaught exception. Moving line 31 inside the `try { ... }` block routes base58 constructor failures directly to the `catch (err)` block, returning `totalRiskScore: 100`, `isUnsafe: true`, and resulting in a fail-secure `decision: 'BLOCKED'` audit.
5. **Inference from Observation 4**: In the MCP server layer (`src/mcp/server.ts`), validating `new PublicKey(...)` within the tool request handler ensures that protocol clients calling `probe_token_rug` or `audit_solana_trade` with non-base58 keys receive `{ isError: true, content: [{ type: 'text', text: 'Sol-Inquisitor Error: Non-base58 character' }] }`, fulfilling the MCP error resilience contract in `tests/mcp.test.ts` and `tests/challenger2_protocol.test.ts`.
6. **Inference from Observation 5**: Updating `README.md` to reference 100/100 passing tests across 5 test suites aligns documentation with the verified test suite, resolving Reviewer 1 Finding 1 and Reviewer 2 Finding 3.

---

## 3. Caveats

- **Network Mode**: The investigation was conducted offline using mocked Solana ledger states. All findings are deterministic and independent of live Solana mainnet RPC health.
- **Test Suite Updates**: Challenger 2 wrote tests 1.5, 2.3, and 2.4 in `tests/challenger2_protocol.test.ts` to assert the flawed behavior (reproducing the vulnerability). When the fixes are applied, those test assertions must be updated to assert the secure behavior (`isError: true` and `ZodError` rejections), as explicitly stated in Challenger 2's Invalidation Condition.

---

## 4. Conclusion & Exact Code Fix Strategy

The vulnerabilities identified by Challenger 2 and Reviewers 1 & 2 are completely validated and straightforward to resolve. The implementer must execute the following exact code changes.

### Fix 1: `src/mcp/server.ts`

**Target File**: `/Users/samaraldico/sol-inquisitor/src/mcp/server.ts`

#### Edit 1.1: Add Imports
**Lines 8–9**:
```typescript
// BEFORE:
import { SolInquisitorPlugin } from '../plugin';
import { InquisitorConfig } from '../types';

// AFTER:
import { SolInquisitorPlugin } from '../plugin';
import { InquisitorConfig, MevGuardInputSchema, RugProbeInputSchema } from '../types';
import { PublicKey } from '@solana/web3.js';
```

#### Edit 1.2: Validate Base58 in `audit_solana_trade`
**Around lines 121–134**:
```typescript
// BEFORE:
      if (name === 'audit_solana_trade') {
        const targetMint = String(args?.targetMint);
        const expectedOutput = Number(args?.expectedOutput);
        const maxSlippageBps = args?.maxSlippageBps !== undefined ? Number(args.maxSlippageBps) : 100;
        const walletPublicKey = args?.walletPublicKey ? String(args.walletPublicKey) : undefined;
        const transactionBase64 = args?.transactionBase64 ? String(args.transactionBase64) : undefined;

        const auditReport = await inquisitor.auditTradeProposal({
          targetMint,
          expectedOutput,
          maxSlippageBps,
          walletPublicKey,
          transactionBase64,
        });

// AFTER:
      if (name === 'audit_solana_trade') {
        const targetMint = String(args?.targetMint);
        new PublicKey(targetMint); // Enforce valid base58 public key for MCP tool call
        const expectedOutput = Number(args?.expectedOutput);
        const maxSlippageBps = args?.maxSlippageBps !== undefined ? Number(args.maxSlippageBps) : 100;
        const walletPublicKey = args?.walletPublicKey ? String(args.walletPublicKey) : undefined;
        const transactionBase64 = args?.transactionBase64 ? String(args.transactionBase64) : undefined;

        const auditReport = await inquisitor.auditTradeProposal({
          targetMint,
          expectedOutput,
          maxSlippageBps,
          walletPublicKey,
          transactionBase64,
        });
```

#### Edit 1.3: Parse `RugProbeInputSchema` and Validate Base58 in `probe_token_rug`
**Around lines 145–157**:
```typescript
// BEFORE:
      if (name === 'probe_token_rug') {
        const targetMint = String(args?.targetMint);
        const rugReport = await inquisitor.probeRug(targetMint);

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(rugReport, null, 2),
            },
          ],
        };
      }

// AFTER:
      if (name === 'probe_token_rug') {
        const validated = RugProbeInputSchema.parse(args);
        new PublicKey(validated.targetMint); // Enforce valid base58 public key for MCP tool call
        const rugReport = await inquisitor.probeRug(validated.targetMint);

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(rugReport, null, 2),
            },
          ],
        };
      }
```

#### Edit 1.4: Parse `MevGuardInputSchema` in `assess_mev_risk`
**Around lines 159–172**:
```typescript
// BEFORE:
      if (name === 'assess_mev_risk') {
        const maxSlippageBps = Number(args?.maxSlippageBps);
        const expectedOutput = args?.expectedOutput !== undefined ? Number(args.expectedOutput) : undefined;
        const mevReport = inquisitor.assessMev(maxSlippageBps, expectedOutput);

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(mevReport, null, 2),
            },
          ],
        };
      }

// AFTER:
      if (name === 'assess_mev_risk') {
        const validated = MevGuardInputSchema.parse({
          maxSlippageBps: args?.maxSlippageBps !== undefined ? Number(args.maxSlippageBps) : undefined,
          expectedOutput: args?.expectedOutput !== undefined ? Number(args.expectedOutput) : undefined,
          tradeSizeUsd: args?.tradeSizeUsd !== undefined ? Number(args.tradeSizeUsd) : undefined,
        });
        const mevReport = inquisitor.assessMev(validated.maxSlippageBps, validated.expectedOutput);

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(mevReport, null, 2),
            },
          ],
        };
      }
```

---

### Fix 2: `src/plugin.ts`

**Target File**: `/Users/samaraldico/sol-inquisitor/src/plugin.ts`

#### Edit 2.1: Enforce `RugProbeInputSchema.parse` in `probe_token_rug` Action Handler
**Around lines 276–280**:
```typescript
// BEFORE:
        schema: RugProbeInputSchema,
        handler: async (_agent: unknown, input: { targetMint: string }) => {
          return await this.probeRug(input.targetMint);
        },

// AFTER:
        schema: RugProbeInputSchema,
        handler: async (_agent: unknown, input: unknown) => {
          const validated = RugProbeInputSchema.parse(input);
          return await this.probeRug(validated.targetMint);
        },
```

#### Edit 2.2: Enforce `MevGuardInputSchema.parse` in `assess_mev_risk` Action Handler
**Around lines 299–303**:
```typescript
// BEFORE:
        schema: MevGuardInputSchema,
        handler: async (_agent: unknown, input: { maxSlippageBps: number; expectedOutput?: number }) => {
          return this.assessMev(input.maxSlippageBps, input.expectedOutput);
        },

// AFTER:
        schema: MevGuardInputSchema,
        handler: async (_agent: unknown, input: unknown) => {
          const validated = MevGuardInputSchema.parse(input);
          return this.assessMev(validated.maxSlippageBps, validated.expectedOutput);
        },
```

---

### Fix 3: `src/modules/rugProbe.ts`

**Target File**: `/Users/samaraldico/sol-inquisitor/src/modules/rugProbe.ts`

#### Edit 3.1: Move `new PublicKey` Inside `try { ... }` Block
**Around lines 30–50**:
```typescript
// BEFORE:
  const mintPubkey = new PublicKey(targetMintStr);
  const reasons: string[] = [];

  let freezeRiskScore = 0;
  let mintRiskScore = 0;
  let concentrationRiskScore = 0;
  let hasFreezeAuthority = false;
  let freezeAuthority: string | null = null;
  let hasMintAuthority = false;
  let mintAuthority: string | null = null;
  let topHoldersSharePercentage = 0;
  const topHolders: TopHolderInfo[] = [];

  // 1. Inspect Mint Account
  try {
    const mintInfo = options.mintInfoFetcher
      ? await options.mintInfoFetcher(connection, mintPubkey)
      : await getMint(connection, mintPubkey);

// AFTER:
  const reasons: string[] = [];

  let freezeRiskScore = 0;
  let mintRiskScore = 0;
  let concentrationRiskScore = 0;
  let hasFreezeAuthority = false;
  let freezeAuthority: string | null = null;
  let hasMintAuthority = false;
  let mintAuthority: string | null = null;
  let topHoldersSharePercentage = 0;
  const topHolders: TopHolderInfo[] = [];

  // 1. Inspect Mint Account
  try {
    const mintPubkey = new PublicKey(targetMintStr);

    const mintInfo = options.mintInfoFetcher
      ? await options.mintInfoFetcher(connection, mintPubkey)
      : await getMint(connection, mintPubkey);
```

---

### Fix 4: `README.md`

**Target File**: `/Users/samaraldico/sol-inquisitor/README.md`

#### Edit 4.1: Test Badge (Line 8)
```markdown
<!-- BEFORE -->
[![Tests: 22/22 Passing](https://img.shields.io/badge/Tests-22%2F22%20Passing-brightgreen.svg)](tests/)

<!-- AFTER -->
[![Tests: 100/100 Passing](https://img.shields.io/badge/Tests-100%2F100%20Passing-brightgreen.svg)](tests/)
```

#### Edit 4.2: Quickstart Test Description (Line 155)
```markdown
<!-- BEFORE -->
All 22 unit tests execute in under 2 seconds with zero network dependency using mocked Solana ledger states.

<!-- AFTER -->
All 100 unit and integration tests execute in under 2 seconds with zero network dependency using mocked Solana ledger states.
```

#### Edit 4.3: Loom Script Narration (Line 447)
```markdown
<!-- BEFORE -->
It features a complete test suite of twenty-two tests that execute in under two seconds with zero network dependency using mocked ledger states.

<!-- AFTER -->
It features a complete test suite of one hundred tests that execute in under two seconds with zero network dependency using mocked ledger states.
```

#### Edit 4.4: Verification Matrix Table (Lines 456–463)
```markdown
<!-- BEFORE -->
| Test File | Test Suite Name | Verification Focus | Status |
| :--- | :--- | :--- | :--- |
| `tests/rugProbe.test.ts` | `rugProbe Module` | Freeze authority veto (+45), mint authority detection (+35), dual authority honeypot rejection, whale concentration tiers ($\ge 80\% \rightarrow +30$), clean decentralized token approval, fail-secure RPC error fallback. | ✅ 6/6 Passed |
| `tests/simulation.test.ts` | `simulation Module` | Balance delta calculation, slippage boundary enforcement, on-chain program revert intercept, raw transaction deserialization & simulation, dry-run parameter audit, fail-secure RPC drop. | ✅ 6/6 Passed |
| `tests/plugin.test.ts` | `SolInquisitorPlugin E2E` | End-to-end honeypot proposal veto, critical MEV sandwich veto (>500 bps), clean decentralized trade approval, Solana Agent Kit V2 action handler execution, slippage tiering. | ✅ 5/5 Passed |
| `tests/mcp.test.ts` | `MCP Server Integration` | MCP stdio server initialization, tool listing schema for `audit_solana_trade`, `probe_token_rug`, and `assess_mev_risk`, offline tool execution, and error handling. | ✅ 5/5 Passed |
| **Total** | **4 Suites** | **Complete System Verification** | **✅ 22/22 Passed** |

<!-- AFTER -->
| Test File | Test Suite Name | Verification Focus | Status |
| :--- | :--- | :--- | :--- |
| `tests/rugProbe.test.ts` | `rugProbe Module` | Freeze authority veto (+45), mint authority detection (+35), dual authority honeypot rejection, whale concentration tiers ($\ge 80\% \rightarrow +30$), clean decentralized token approval, fail-secure RPC error fallback. | ✅ 6/6 Passed |
| `tests/simulation.test.ts` | `simulation Module` | Balance delta calculation, slippage boundary enforcement, on-chain program revert intercept, raw transaction deserialization & simulation, dry-run parameter audit, fail-secure RPC drop. | ✅ 6/6 Passed |
| `tests/plugin.test.ts` | `SolInquisitorPlugin E2E` | End-to-end honeypot proposal veto, critical MEV sandwich veto (>500 bps), clean decentralized trade approval, Solana Agent Kit V2 action handler execution, slippage tiering. | ✅ 5/5 Passed |
| `tests/mcp.test.ts` | `MCP Server Integration` | MCP stdio server initialization, tool listing schema for `audit_solana_trade`, `probe_token_rug`, and `assess_mev_risk`, offline tool execution, and error handling. | ✅ 24/24 Passed |
| `tests/e2e.test.ts` | `Opaque-Box E2E Suite` | Tiers 1-4 comprehensive requirements verification across R1-R4, boundary transitions, cross-feature combinations, and real-world trading scenarios. | ✅ 59/59 Passed |
| **Total** | **5 Suites** | **Complete System Verification** | **✅ 100/100 Passed** |
```

---

### Fix 5: `tests/challenger2_protocol.test.ts` Test Assertion Updates

**Target File**: `/Users/samaraldico/sol-inquisitor/tests/challenger2_protocol.test.ts`

When the code fixes are applied, update the three empirical tests that reproduced the vulnerabilities so they assert the remediated secure behavior:

#### Edit 5.1: Test 1.5 (`assess_mev_risk` Fuzzing)
**Lines 171–202**:
Update assertions so missing slippage, negative slippage, and string slippage all expect `isError: true`:
```typescript
    test('1.5: Fuzz assess_mev_risk: missing and malformed arguments empirical behavior', async () => {
      // Missing maxSlippageBps: rejects with isError: true
      const resMissing = (await client.callTool({
        name: 'assess_mev_risk',
        arguments: {},
      })) as any;
      expect(resMissing.isError).toBe(true);
      expect(resMissing.content[0].text).toContain('Sol-Inquisitor Error');

      // Malformed negative slippage: rejects with isError: true
      const resNeg = (await client.callTool({
        name: 'assess_mev_risk',
        arguments: { maxSlippageBps: -500 },
      })) as any;
      expect(resNeg.isError).toBe(true);
      expect(resNeg.content[0].text).toContain('Sol-Inquisitor Error');

      // Malformed string slippage: rejects with isError: true
      const resStr = (await client.callTool({
        name: 'assess_mev_risk',
        arguments: { maxSlippageBps: 'invalid_string' },
      })) as any;
      expect(resStr.isError).toBe(true);
      expect(resStr.content[0].text).toContain('Sol-Inquisitor Error');
    });
```

#### Edit 5.2: Test 2.3 (`probe_token_rug` Handler)
**Lines 291–303**:
Update assertion so passing `{}` rejects with `ZodError` instead of `TypeError`:
```typescript
    test('2.3: Action handler probe_token_rug behavior on malformed input', async () => {
      const rugAction = plugin.actions.find((a) => a.name === 'probe_token_rug')!;

      // When passed invalid mint length, throws ZodError
      await expect(
        rugAction.handler(null, { targetMint: 'short' } as any)
      ).rejects.toThrow(ZodError);

      // When passed empty object, throws ZodError because RugProbeInputSchema.parse is called in handler
      await expect(
        rugAction.handler(null, {} as any)
      ).rejects.toThrow(ZodError);
    });
```

#### Edit 5.3: Test 2.4 (`assess_mev_risk` Handler)
**Lines 305–317**:
Update assertions so invalid slippage and empty input reject with `ZodError`:
```typescript
    test('2.4: Action handler assess_mev_risk behavior on malformed input (Zod interceptor)', async () => {
      const mevAction = plugin.actions.find((a) => a.name === 'assess_mev_risk')!;

      // Passing negative slippage rejects with ZodError
      await expect(
        mevAction.handler(null, { maxSlippageBps: -100 } as any)
      ).rejects.toThrow(ZodError);

      // Passing empty object rejects with ZodError
      await expect(
        mevAction.handler(null, {} as any)
      ).rejects.toThrow(ZodError);
    });
```

---

## 5. Verification Method

Once the implementer applies the changes:

1. **Verify TypeScript Strict Compilation**:
   ```bash
   npm run build
   ```
   *Expected*: Exit code 0, clean compilation, zero type errors.

2. **Verify All Offline Test Suites**:
   ```bash
   npm test
   ```
   *Expected*: 7 passed suites, 138 passed tests, zero failures.

3. **Verify Challenger 2 Protocol Suite Specifically**:
   ```bash
   npx jest tests/challenger2_protocol.test.ts
   ```
   *Expected*: 18 passed tests, confirming all fuzzing, Zod interceptors, and fail-secure network behaviors pass.

4. **Verify Interactive Showcase CLI**:
   ```bash
   npm run demo
   ```
   *Expected*: Clean terminal demonstration of Scenarios 1, 2, and 3 without exceptions.

5. **Invalidation Conditions**:
   - Any compiler error in `src/mcp/server.ts`, `src/plugin.ts`, or `src/modules/rugProbe.ts`.
   - Any test regression in `tests/mcp.test.ts`, `tests/plugin.test.ts`, or `tests/e2e.test.ts`.
   - Any unhandled exception when calling `plugin.auditTradeProposal({ targetMint: '0'.repeat(32), ... })`.
