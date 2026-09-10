# Challenger 2 Report: MCP & SAK V2 Protocol Stress Testing

**Challenger**: Challenger 2 (MCP & Solana Agent Kit V2 Protocol Challenger)  
**Date**: 2026-09-10T13:15:00Z  
**Verdict**: **REJECT** (Pending resolution of 3 empirical interface vulnerabilities)  
**Repository**: `/Users/samaraldico/sol-inquisitor`  
**Test Suite**: `tests/challenger2_protocol.test.ts` (18 empirical tests, all reproducible)  

---

## 1. Observation

### Observation 1: MCP & SAK V2 `assess_mev_risk` Fails Open on Missing / Malformed Slippage
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
When executed via `npx ts-node`:
```bash
$ npx ts-node -e "
const { startMcpServer } = require('./src/mcp/server');
const { InMemoryTransport } = require('@modelcontextprotocol/sdk/inMemory.js');
const { Client } = require('@modelcontextprotocol/sdk/client/index.js');
async function run() {
  const s = await startMcpServer();
  const [cT, sT] = InMemoryTransport.createLinkedPair();
  const c = new Client({ name: 't', version: '1' }, { capabilities: {} });
  await Promise.all([s.connect(sT), c.connect(cT)]);
  console.log(await c.callTool({ name: 'assess_mev_risk', arguments: {} }));
}
run();"
```
**Verbatim Output**:
```json
{
  "content": [
    {
      "type": "text",
      "text": "{\n  \"slippageBps\": null,\n  \"mevRiskScore\": 5,\n  \"riskLevel\": \"LOW\",\n  \"sandwichVulnerability\": false,\n  \"estimatedExtractableValueBps\": null,\n  \"recommendedMaxSlippageBps\": null,\n  \"reasons\": [\n    \"Tight slippage tolerance (NaN%). Strong protection against sandwich attacks.\"\n  ]\n}"
    }
  ]
}
```
Notice `isError` is **falsy** (not set to `true`). The MCP server and SAK V2 plugin action handler return a report falsely certifying the trade as `LOW` MEV risk with score 5 and `"Tight slippage tolerance (NaN%)"`! The same occurs when passing negative slippage (`{ maxSlippageBps: -500 }`) or non-numeric strings (`{ maxSlippageBps: 'critical' }`).

---

### Observation 2: SAK V2 `probe_token_rug` Action Handler Bypasses Zod Schema Interceptor
In `src/plugin.ts` (lines 276–280):
```typescript
schema: RugProbeInputSchema,
handler: async (_agent: unknown, input: { targetMint: string }) => {
  return await this.probeRug(input.targetMint);
},
```
When invoked directly with empty arguments `{}` or invalid types via SAK V2:
```bash
$ npx ts-node -e "
const { SolInquisitorPlugin } = require('./src/plugin');
const p = new SolInquisitorPlugin();
const a = p.actions.find(x => x.name === 'probe_token_rug');
a.handler(null, {}).catch(err => console.log(err.name, err.message));
"
```
**Verbatim Output**:
```text
TypeError Cannot read properties of undefined (reading '_bn')
```
The handler does not execute `RugProbeInputSchema.parse(input)`. It passes `undefined` straight to `new PublicKey(undefined)`, throwing an unhandled runtime `TypeError` instead of a standardized `ZodError` before lower layer execution.

---

### Observation 3: Non-Base58 32-Char String Throws Unhandled Error in `probeRugRisks`
In `src/modules/rugProbe.ts` (lines 22–32):
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
  try {
    const mintInfo = ...
```
When invoked with a 32-character string that contains invalid base58 characters (e.g. `'0'.repeat(32)`):
```bash
$ npx ts-node -e "
const { SolInquisitorPlugin } = require('./src/plugin');
const p = new SolInquisitorPlugin();
p.auditTradeProposal({ targetMint: '0'.repeat(32), expectedOutput: 1000, maxSlippageBps: 100 })
 .catch(err => console.log(err.constructor.name, err.message));
"
```
**Verbatim Output**:
```text
Error Non-base58 character
```
`TradeProposalSchema` only validates `.min(32).max(44)`. Because `new PublicKey` at line 31 is outside the `try { ... } catch` block in `src/modules/rugProbe.ts`, it causes `auditTradeProposal` to reject with an unhandled exception instead of generating a fail-secure `RugRiskReport` (`isUnsafe: true`, `totalRiskScore: 100`).

---

### Observation 4: Verified Passing Capabilities
In `tests/challenger2_protocol.test.ts` and repository test suites:
- **MCP Protocol Fuzzing**: Unknown tools (`__proto__`, `DROP TABLE`, `<script>`, empty names) return `{ isError: true }` without crashing or terminating transport. Server survived a rapid burst of 30 malformed calls and remained 100% operational for subsequent valid trade proposal audits.
- **`audit_solana_trade` Fuzzing**: Rejects missing `targetMint`, missing `expectedOutput`, negative outputs, string slippages, and out-of-bounds slippage (> 10,000 bps) with `{ isError: true }`.
- **Fail-Secure Network Behavior**:
  - `ETIMEDOUT` on `getMint` -> `decision: 'BLOCKED'`, `overallRiskScore: 100`.
  - `ECONNREFUSED` on `getMint` -> `decision: 'BLOCKED'`, `overallRiskScore: 100`.
  - HTTP 500 Internal Server Error on `getMint` -> `decision: 'BLOCKED'`, `overallRiskScore: 100`.
  - HTTP 429 Rate Limit on `getMint` -> `decision: 'BLOCKED'`, `overallRiskScore: 100`.
  - Network timeout on `simulateTransaction` -> `decision: 'BLOCKED'`, `overallRiskScore: 100`, `vetoed: true`.
  - HTTP 500 on `simulateTransaction` -> `decision: 'BLOCKED'`, `overallRiskScore: 100`.
  - Non-Error throws (`throw 'RPC_HANG'`) -> `decision: 'BLOCKED'`, `overallRiskScore: 100`.

---

## 2. Logic Chain

1. **Premise**: In an autonomous agent system (LangChain, Claude, ElizaOS, Antigravity), agents rely on MCP tool schemas and SAK V2 plugin action schemas to guarantee that invalid or missing parameters are rejected before business logic is executed.
2. **Observation 1 demonstrates** that calling `assess_mev_risk` without `maxSlippageBps` or with negative/string values does NOT return `{ isError: true }`. Instead, `Number(undefined)` yields `NaN`, which bypasses all threshold comparisons (`NaN > 50` is `false`) and falls into the `else` branch of `assessMevRisk`. It generates an approval report claiming `"Tight slippage tolerance (NaN%). Strong protection against sandwich attacks."` with `riskLevel: 'LOW'`. This represents a **fail-open vulnerability** where malformed parameters cause the MEV guard to falsely report zero risk.
3. **Observation 2 demonstrates** that `probe_token_rug` plugin action handler does not run `RugProbeInputSchema.parse(input)`, violating the interface contract specified in DISPATCH.md: *"Verify Zod schemas intercept and reject before reaching RPC"*. Calling the handler with `{}` triggers an unhandled `TypeError` inside the Solana web3 library rather than a clean Zod validation rejection.
4. **Observation 3 demonstrates** that `probeRugRisks` places `new PublicKey(targetMintStr)` before the `try` block. If a token mint has valid length (32–44 characters) but contains non-base58 characters (e.g. `'0'`, `'O'`, `'I'`, `'l'`), `new PublicKey` throws an uncaught `Error: Non-base58 character`, causing `auditTradeProposal` to reject with an unhandled exception rather than returning a fail-secure `RugRiskReport` (`isUnsafe: true`, risk 100).
5. **Conclusion**: While core simulation and rug probe logic are exceptionally strong and fail-secure against network outages, the missing Zod validation in `assess_mev_risk` and SAK action handlers creates an interface vulnerability that can cause autonomous agents to trade under false-safe assumptions. Therefore, the implementation must be **REJECTED** until these 3 specific items are remediated.

---

## 3. Caveats

- **No Caveats**. All failure modes were reproduced empirically via executable TypeScript tests in `tests/challenger2_protocol.test.ts` and direct node execution.
- No production live RPC keys were required; all behaviors were validated deterministically using the repository's native in-memory transports and mocked connection adapters.

---

## 4. Conclusion & Recommended Action Plan

**Verdict**: **REJECT**

To achieve full approval, the worker must implement the following three targeted fixes:

### Remediation Item 1: Enforce `MevGuardInputSchema` in MCP `assess_mev_risk`
In `src/mcp/server.ts` (around line 160), parse incoming arguments using `MevGuardInputSchema`:
```typescript
if (name === 'assess_mev_risk') {
  const validated = MevGuardInputSchema.parse({
    maxSlippageBps: args?.maxSlippageBps !== undefined ? Number(args.maxSlippageBps) : undefined,
    expectedOutput: args?.expectedOutput !== undefined ? Number(args.expectedOutput) : undefined,
  });
  const mevReport = inquisitor.assessMev(validated.maxSlippageBps, validated.expectedOutput);
```

### Remediation Item 2: Enforce Schema Parsing in SAK V2 Action Handlers
In `src/plugin.ts` (around lines 277 and 300):
```typescript
// probe_token_rug handler:
handler: async (_agent: unknown, input: unknown) => {
  const validated = RugProbeInputSchema.parse(input);
  return await this.probeRug(validated.targetMint);
},

// assess_mev_risk handler:
handler: async (_agent: unknown, input: unknown) => {
  const validated = MevGuardInputSchema.parse(input);
  return this.assessMev(validated.maxSlippageBps, validated.expectedOutput);
},
```

### Remediation Item 3: Move PublicKey Instantiation Inside `try` in `probeRugRisks`
In `src/modules/rugProbe.ts` (around line 31), move `const mintPubkey = new PublicKey(targetMintStr);` inside the `try { ... }` block so invalid base58 strings trigger the fail-secure catch block (returning risk 100 and `isUnsafe: true`).

---

## 5. Verification Method

To independently verify these findings:

1. **Run Full Test Suite**:
   ```bash
   npm test
   ```
   Inspect `tests/challenger2_protocol.test.ts` lines 171–200 and lines 285–298.
2. **Execute Targeted Stress Verification**:
   ```bash
   npx jest tests/challenger2_protocol.test.ts
   ```
3. **Reproduce Fail-Open MEV Tool Call**:
   ```bash
   npx ts-node -e "
   const { startMcpServer } = require('./src/mcp/server');
   const { InMemoryTransport } = require('@modelcontextprotocol/sdk/inMemory.js');
   const { Client } = require('@modelcontextprotocol/sdk/client/index.js');
   startMcpServer().then(async s => {
     const [cT, sT] = InMemoryTransport.createLinkedPair();
     const c = new Client({ name: 't', version: '1' }, { capabilities: {} });
     await Promise.all([s.connect(sT), c.connect(cT)]);
     const res = await c.callTool({ name: 'assess_mev_risk', arguments: {} });
     console.log('isError:', res.isError);
     console.log('Report:', JSON.parse(res.content[0].text));
   });"
   ```
   **Expected**: Should return `isError: true` and reject.  
   **Actual**: Returns `isError: undefined` and reports `riskLevel: "LOW"`.
4. **Invalidation Condition**:
   Once the worker applies the 3 remediation items, `assess_mev_risk` over MCP and SAK V2 will reject missing/malformed inputs with `isError: true` / `ZodError`, and `probeRugRisks` will fail-securely return `riskScore: 100` on non-base58 mints. Upon re-testing, this verdict will convert to **APPROVE**.

---

## Adversarial Challenge Matrix

| Challenge ID | Target Subsystem | Severity | Assumption Challenged | Empirical Result | Status |
|:---:|:---|:---:|:---|:---|:---:|
| **CHAL-01** | MCP `assess_mev_risk` | **CRITICAL** | Omitted or malformed slippage tolerance is rejected with `{ isError: true }`. | Bypasses checks, returns `riskLevel: 'LOW'`, `NaN%` slippage, and `isError: false`. | **CONFIRMED VULNERABILITY** |
| **CHAL-02** | SAK V2 Action Handlers | **MEDIUM** | Handlers validate inputs via `action.schema` before passing to internal methods. | Handlers bypass `schema.parse()`, causing unhandled `TypeError` or false-safe returns. | **CONFIRMED VULNERABILITY** |
| **CHAL-03** | `probeRugRisks` | **LOW-MEDIUM** | Non-base58 32-character strings trigger fail-secure fallback. | `new PublicKey` is outside `try/catch`, crashing caller with uncaught exception. | **CONFIRMED VULNERABILITY** |
| **CHAL-04** | MCP Protocol & Transport | **LOW** | Malformed requests or rapid fuzz bursts crash stdio/in-memory transport. | Server survived 30 burst error calls and processed valid requests immediately. | **ROBUST / PASSED** |
| **CHAL-05** | Pre-Flight RPC Outages | **HIGH** | Network timeouts (`ETIMEDOUT`, `ECONNREFUSED`, 500) fail-securely veto trade. | Cleanly defaults to `decision: 'BLOCKED'` and `riskScore: 100`. | **ROBUST / PASSED** |
