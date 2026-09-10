import { Connection, PublicKey, Transaction } from '@solana/web3.js';
import { SolInquisitorPlugin } from '../src/plugin';
import { probeRugRisks } from '../src/modules/rugProbe';
import { assessMevRisk } from '../src/modules/mevGuard';
import { simulateAndVerifyProposal } from '../src/modules/simulation';
import { startMcpServer } from '../src/mcp/server';
import { CallToolRequestSchema } from '@modelcontextprotocol/sdk/types.js';

describe('Challenger 1 Adversarial Stress Harness', () => {
  let mockConnection: Connection;
  const dummyMint = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';
  const dummyCreator = '9xQeWvG816bUx9EPjHmaT23yvVM2ZWbrrpZb9PusVFin';

  beforeEach(() => {
    jest.clearAllMocks();
    mockConnection = {
      simulateTransaction: jest.fn(),
      getTokenLargestAccounts: jest.fn(),
    } as unknown as Connection;
  });

  // ==========================================================================
  // SECTION 1: HONEYPOT EVASION ATTEMPTS & AUTHORITY BORDER CONDITIONS
  // ==========================================================================
  describe('1. Honeypot Evasion & Authority Border Conditions', () => {
    test('Border condition: Mint Authority alone with 34.99% concentration -> total risk 35 < 40 (PASSES default rule)', async () => {
      // 10,000 total supply, top 5 holders hold 3499 (34.99%)
      const mintInfo = {
        freezeAuthority: null,
        mintAuthority: new PublicKey(dummyCreator),
        supply: 10000n,
      };

      const pk1 = new PublicKey('11111111111111111111111111111111');
      const pk2 = new PublicKey('So11111111111111111111111111111111111111112');
      const pk3 = new PublicKey('TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA');
      const pk4 = new PublicKey('ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL');
      const pk5 = new PublicKey('SysvarRent111111111111111111111111111111111');

      const largestAccounts = {
        value: [
          { address: pk1, amount: '1000', uiAmount: 1000 },
          { address: pk2, amount: '1000', uiAmount: 1000 },
          { address: pk3, amount: '800', uiAmount: 800 },
          { address: pk4, amount: '400', uiAmount: 400 },
          { address: pk5, amount: '299', uiAmount: 299 },
        ],
      };

      const report = await probeRugRisks(mockConnection, dummyMint, {
        mintInfoFetcher: async () => mintInfo,
        largestAccountsFetcher: async () => largestAccounts,
      });

      expect(report.hasMintAuthority).toBe(true);
      expect(report.mintRiskScore).toBe(35);
      expect(report.topHoldersSharePercentage).toBe(34.99);
      expect(report.concentrationRiskScore).toBe(0);
      expect(report.totalRiskScore).toBe(35);
      expect(report.isUnsafe).toBe(false); // 35 < 40 -> Not flagged as unsafe by default threshold
    });

    test('Border condition: Mint Authority alone with 35.00% concentration -> total risk 45 >= 40 (REJECTED/UNSAFE)', async () => {
      // 10,000 total supply, top 5 holders hold 3500 (35.00%)
      const mintInfo = {
        freezeAuthority: null,
        mintAuthority: new PublicKey(dummyCreator),
        supply: 10000n,
      };

      const pk1 = new PublicKey('11111111111111111111111111111111');
      const pk2 = new PublicKey('So11111111111111111111111111111111111111112');
      const pk3 = new PublicKey('TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA');
      const pk4 = new PublicKey('ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL');
      const pk5 = new PublicKey('SysvarRent111111111111111111111111111111111');

      const largestAccounts = {
        value: [
          { address: pk1, amount: '1000', uiAmount: 1000 },
          { address: pk2, amount: '1000', uiAmount: 1000 },
          { address: pk3, amount: '800', uiAmount: 800 },
          { address: pk4, amount: '400', uiAmount: 400 },
          { address: pk5, amount: '300', uiAmount: 300 },
        ],
      };

      const report = await probeRugRisks(mockConnection, dummyMint, {
        mintInfoFetcher: async () => mintInfo,
        largestAccountsFetcher: async () => largestAccounts,
      });

      expect(report.hasMintAuthority).toBe(true);
      expect(report.mintRiskScore).toBe(35);
      expect(report.topHoldersSharePercentage).toBe(35.0);
      expect(report.concentrationRiskScore).toBe(10);
      expect(report.totalRiskScore).toBe(45);
      expect(report.isUnsafe).toBe(true); // 45 >= 40 -> Triggered rejection
      expect(report.reasons.some((r) => r.includes('Moderate holder concentration'))).toBe(true);
    });

    test('Freeze Authority alone -> total risk 45 >= 40 (IMMEDIATE REJECTION even with 0% concentration)', async () => {
      const mintInfo = {
        freezeAuthority: new PublicKey(dummyCreator),
        mintAuthority: null,
        supply: 1000000n,
      };

      const largestAccounts = {
        value: [], // Zero holders detected
      };

      const report = await probeRugRisks(mockConnection, dummyMint, {
        mintInfoFetcher: async () => mintInfo,
        largestAccountsFetcher: async () => largestAccounts,
      });

      expect(report.hasFreezeAuthority).toBe(true);
      expect(report.freezeRiskScore).toBe(45);
      expect(report.totalRiskScore).toBe(45);
      expect(report.isUnsafe).toBe(true);
    });

    test('Uninitialized or zero-supply tokens handle division safely without NaN or crash', async () => {
      // Token exists but has supply = 0
      const zeroSupplyMint = {
        freezeAuthority: null,
        mintAuthority: null,
        supply: 0n,
      };

      const report = await probeRugRisks(mockConnection, dummyMint, {
        mintInfoFetcher: async () => zeroSupplyMint,
        largestAccountsFetcher: async () => ({ value: [] }),
      });

      expect(report.totalRiskScore).toBe(0);
      expect(report.topHoldersSharePercentage).toBe(0);
      expect(report.isUnsafe).toBe(false);
      expect(isNaN(report.topHoldersSharePercentage)).toBe(false);
      expect(isNaN(report.totalRiskScore)).toBe(false);
    });

    test('Non-existent or uninitialized mint account triggers fail-secure 100 risk veto', async () => {
      const report = await probeRugRisks(mockConnection, dummyMint, {
        mintInfoFetcher: async () => {
          throw new Error('TokenAccountNotFoundError: Account not found on Solana ledger');
        },
      });

      expect(report.isUnsafe).toBe(true);
      expect(report.totalRiskScore).toBe(100);
      expect(report.freezeAuthority).toBe('UNKNOWN_VERIFICATION_FAILED');
      expect(report.reasons.some((r) => r.includes('fail-secure protocol'))).toBe(true);
    });

    test('Extreme u64 supply magnitude does not overflow double-precision arithmetic', async () => {
      // 10^18 supply (standard for 1B tokens with 9 decimals)
      const hugeSupply = 1000000000000000000n;
      const mintInfo = {
        freezeAuthority: null,
        mintAuthority: null,
        supply: hugeSupply,
      };

      // Top holder has 50%
      const largestAccounts = {
        value: [
          {
            address: new PublicKey('11111111111111111111111111111111'),
            amount: '500000000000000000',
            uiAmount: 500000000,
          },
        ],
      };

      const report = await probeRugRisks(mockConnection, dummyMint, {
        mintInfoFetcher: async () => mintInfo,
        largestAccountsFetcher: async () => largestAccounts,
      });

      expect(report.topHoldersSharePercentage).toBe(50.0);
      expect(report.concentrationRiskScore).toBe(20);
      expect(report.totalRiskScore).toBe(20);
      expect(report.isUnsafe).toBe(false);
    });
  });

  // ==========================================================================
  // SECTION 2: MEV SANDWICH THRESHOLDS & BOUNDARY TRANSITIONS
  // ==========================================================================
  describe('2. MEV Sandwich Thresholds & Boundary Transitions', () => {
    test('Boundary transition 300 bps (MEDIUM, sandwich: false) vs 301 bps (HIGH, sandwich: true)', () => {
      const at300 = assessMevRisk({ maxSlippageBps: 300 });
      expect(at300.slippageBps).toBe(300);
      expect(at300.mevRiskScore).toBe(45);
      expect(at300.riskLevel).toBe('MEDIUM');
      expect(at300.sandwichVulnerability).toBe(false);

      const at301 = assessMevRisk({ maxSlippageBps: 301 });
      expect(at301.slippageBps).toBe(301);
      expect(at301.mevRiskScore).toBe(75);
      expect(at301.riskLevel).toBe('HIGH');
      expect(at301.sandwichVulnerability).toBe(true);
    });

    test('Plugin decision gate at 300 vs 301 bps with default mevScoreThreshold (50)', async () => {
      const plugin = new SolInquisitorPlugin({
        probeOverrides: {
          mintInfoFetcher: async () => ({
            freezeAuthority: null,
            mintAuthority: null,
            supply: 1000000n,
          }),
          largestAccountsFetcher: async () => ({ value: [] }),
        },
      });

      // At 300 bps: risk score 45 < 50 threshold -> APPROVED
      const report300 = await plugin.auditTradeProposal({
        targetMint: dummyMint,
        expectedOutput: 1000,
        maxSlippageBps: 300,
      });
      expect(report300.decision).toBe('APPROVED');
      expect(report300.breakdown.mevGuard.sandwichVulnerability).toBe(false);

      // At 301 bps: risk score 75 >= 50 threshold -> BLOCKED
      const report301 = await plugin.auditTradeProposal({
        targetMint: dummyMint,
        expectedOutput: 1000,
        maxSlippageBps: 301,
      });
      expect(report301.decision).toBe('BLOCKED');
      expect(report301.breakdown.mevGuard.sandwichVulnerability).toBe(true);
      expect(report301.vetoReasons.some((r) => r.includes('MEV Guard flagged high sandwich risk'))).toBe(true);
    });

    test('Boundary transition 500 bps (HIGH, score 75) vs 501 bps (CRITICAL, score 95)', () => {
      const at500 = assessMevRisk({ maxSlippageBps: 500 });
      expect(at500.slippageBps).toBe(500);
      expect(at500.mevRiskScore).toBe(75);
      expect(at500.riskLevel).toBe('HIGH');
      expect(at500.sandwichVulnerability).toBe(true);

      const at501 = assessMevRisk({ maxSlippageBps: 501 });
      expect(at501.slippageBps).toBe(501);
      expect(at501.mevRiskScore).toBe(95);
      expect(at501.riskLevel).toBe('CRITICAL');
      expect(at501.sandwichVulnerability).toBe(true);
      expect(at501.reasons.some((r) => r.includes('Jito MEV sandwich searchers'))).toBe(true);
    });

    test('Recommended max slippage clamp: never exceeds 100 bps for any input', () => {
      expect(assessMevRisk({ maxSlippageBps: 50 }).recommendedMaxSlippageBps).toBe(50);
      expect(assessMevRisk({ maxSlippageBps: 100 }).recommendedMaxSlippageBps).toBe(100);
      expect(assessMevRisk({ maxSlippageBps: 101 }).recommendedMaxSlippageBps).toBe(100);
      expect(assessMevRisk({ maxSlippageBps: 500 }).recommendedMaxSlippageBps).toBe(100);
      expect(assessMevRisk({ maxSlippageBps: 10000 }).recommendedMaxSlippageBps).toBe(100);
    });

    test('Extractable value BPS formula under adversarial inputs', () => {
      // Formula: Math.max(0, Math.round((slippage - 30) * 0.8))
      expect(assessMevRisk({ maxSlippageBps: 0 }).estimatedExtractableValueBps).toBe(0);
      expect(assessMevRisk({ maxSlippageBps: 30 }).estimatedExtractableValueBps).toBe(0);
      expect(assessMevRisk({ maxSlippageBps: 31 }).estimatedExtractableValueBps).toBe(1);
      expect(assessMevRisk({ maxSlippageBps: 100 }).estimatedExtractableValueBps).toBe(56);
      expect(assessMevRisk({ maxSlippageBps: 10000 }).estimatedExtractableValueBps).toBe(7976);
    });

    test('Trade size escalation: boundary at $10,000 vs $10,001', () => {
      // $10,000 exact -> no penalty
      const at10k = assessMevRisk({ maxSlippageBps: 200, tradeSizeUsd: 10000 });
      expect(at10k.mevRiskScore).toBe(45);

      // $10,001 -> +15 penalty
      const at10k1 = assessMevRisk({ maxSlippageBps: 200, tradeSizeUsd: 10001 });
      expect(at10k1.mevRiskScore).toBe(60);

      // Ceiling at 100: CRITICAL (95) + 15 = 110 clamped to 100
      const at501Large = assessMevRisk({ maxSlippageBps: 501, tradeSizeUsd: 50000 });
      expect(at501Large.mevRiskScore).toBe(100);
    });
  });

  // ==========================================================================
  // SECTION 3: SIMULATION BALANCE DELTA OFF-BY-ONE & REVERT VETOES
  // ==========================================================================
  describe('3. Simulation Balance Delta Off-by-One & Revert Vetoes', () => {
    test('Exact delta off-by-one boundary: M_min vs M_min - 1', async () => {
      // expectedOutput = 100,000, maxSlippageBps = 200 (2%) => minAcceptableOutput = 98,000
      const atBoundary = await simulateAndVerifyProposal({
        connection: mockConnection,
        targetMint: dummyMint,
        expectedOutput: 100000,
        maxSlippageBps: 200,
        mockOverride: {
          preBalance: 0,
          postBalance: 98000, // Exactly minAcceptableOutput
        },
      });

      expect(atBoundary.minAcceptableOutput).toBe(98000);
      expect(atBoundary.actualOutputDelta).toBe(98000);
      expect(atBoundary.slippageExceeded).toBe(false);
      expect(atBoundary.vetoed).toBe(false);

      const oneBelowBoundary = await simulateAndVerifyProposal({
        connection: mockConnection,
        targetMint: dummyMint,
        expectedOutput: 100000,
        maxSlippageBps: 200,
        mockOverride: {
          preBalance: 0,
          postBalance: 97999, // M_min - 1 unit
        },
      });

      expect(oneBelowBoundary.minAcceptableOutput).toBe(98000);
      expect(oneBelowBoundary.actualOutputDelta).toBe(97999);
      expect(oneBelowBoundary.slippageExceeded).toBe(true);
      expect(oneBelowBoundary.vetoed).toBe(true);
      expect(oneBelowBoundary.reasons.some((r) => r.includes('Pre-flight balance delta violation'))).toBe(true);
    });

    test('Fractional delta boundary: floating-point sub-cent precision', async () => {
      // expectedOutput = 1000, maxSlippageBps = 35 (0.35%) => minAcceptableOutput = 996.5
      const exactPass = await simulateAndVerifyProposal({
        connection: mockConnection,
        targetMint: dummyMint,
        expectedOutput: 1000,
        maxSlippageBps: 35,
        mockOverride: {
          preBalance: 0,
          postBalance: 996.5,
        },
      });
      expect(exactPass.slippageExceeded).toBe(false);
      expect(exactPass.vetoed).toBe(false);

      const subCentFail = await simulateAndVerifyProposal({
        connection: mockConnection,
        targetMint: dummyMint,
        expectedOutput: 1000,
        maxSlippageBps: 35,
        mockOverride: {
          preBalance: 0,
          postBalance: 996.49999,
        },
      });
      expect(subCentFail.slippageExceeded).toBe(true);
      expect(subCentFail.vetoed).toBe(true);
    });

    test('Negative output delta (Token balance drain attack) triggers immediate veto', async () => {
      // Malicious contract transfers tokens away instead of delivering tokens
      const drainAttack = await simulateAndVerifyProposal({
        connection: mockConnection,
        targetMint: dummyMint,
        expectedOutput: 500,
        maxSlippageBps: 100,
        mockOverride: {
          preBalance: 1000,
          postBalance: 200, // Lost 800 tokens: delta = -800
        },
      });

      expect(drainAttack.actualOutputDelta).toBe(-800);
      expect(drainAttack.slippageExceeded).toBe(true);
      expect(drainAttack.vetoed).toBe(true);
    });

    test('Zero output delta (Honeypot swap that yields 0 tokens) triggers immediate veto', async () => {
      const zeroOutput = await simulateAndVerifyProposal({
        connection: mockConnection,
        targetMint: dummyMint,
        expectedOutput: 500,
        maxSlippageBps: 100,
        mockOverride: {
          preBalance: 0,
          postBalance: 0,
        },
      });

      expect(zeroOutput.actualOutputDelta).toBe(0);
      expect(zeroOutput.slippageExceeded).toBe(true);
      expect(zeroOutput.vetoed).toBe(true);
    });

    test('Simulation reverts with custom Solana error codes trigger fail-secure veto', async () => {
      const errorVariants = [
        { InstructionError: [0, { Custom: 6001 }] }, // Anchor custom error (e.g. SlippageExceeded)
        { InstructionError: [1, 'InsufficientFunds'] },
        'ProgramFailedToComplete',
        { code: 42, details: 'AccountFrozen' },
      ];

      for (const err of errorVariants) {
        const report = await simulateAndVerifyProposal({
          connection: mockConnection,
          targetMint: dummyMint,
          expectedOutput: 1000,
          maxSlippageBps: 100,
          mockOverride: {
            err,
            logs: ['Program log: Error encountered during simulation'],
            unitsConsumed: 8000,
          },
        });

        expect(report.simulatedSuccess).toBe(false);
        expect(report.vetoed).toBe(true);
        expect(report.effectiveSlippageBps).toBe(10000);
        expect(report.reasons.some((r) => r.includes('Simulation reverted on-chain'))).toBe(true);
      }
    });

    test('Full plugin audit pipeline vetoes when simulation reverts', async () => {
      (mockConnection.simulateTransaction as jest.Mock).mockResolvedValue({
        value: {
          err: { InstructionError: [0, { Custom: 6001 }] },
          logs: ['Program aborted: Slippage limit exceeded in Raydium pool'],
          unitsConsumed: 15000,
        },
      });

      const plugin = new SolInquisitorPlugin({
        connection: mockConnection,
        probeOverrides: {
          mintInfoFetcher: async () => ({
            freezeAuthority: null,
            mintAuthority: null,
            supply: 1000000n,
          }),
          largestAccountsFetcher: async () => ({ value: [] }),
        },
      });

      const dummyTx = new Transaction();
      dummyTx.recentBlockhash = '11111111111111111111111111111111';
      dummyTx.feePayer = new PublicKey('11111111111111111111111111111111');
      const base64Tx = dummyTx.serialize({ requireAllSignatures: false, verifySignatures: false }).toString('base64');

      const audit = await plugin.auditTradeProposal({
        targetMint: dummyMint,
        expectedOutput: 1000,
        maxSlippageBps: 100,
        transactionBase64: base64Tx,
      });

      expect(audit.decision).toBe('BLOCKED');
      expect(audit.overallRiskScore).toBe(100);
      expect(audit.breakdown.simulation?.simulatedSuccess).toBe(false);
      expect(audit.breakdown.simulation?.vetoed).toBe(true);
      expect(audit.vetoReasons.some((r) => r.includes('Simulation engine vetoed transaction execution'))).toBe(true);
    });
  });

  // ==========================================================================
  // SECTION 4: CONCURRENT & ADVERSARIAL MCP STRESS
  // ==========================================================================
  describe('4. MCP Server & Plugin Resilience Under Stress', () => {
    test('Handles 50 concurrent audits simultaneously without state corruption or leakage', async () => {
      const plugin = new SolInquisitorPlugin({
        probeOverrides: {
          mintInfoFetcher: async () => ({
            freezeAuthority: null,
            mintAuthority: null,
            supply: 1000000n,
          }),
          largestAccountsFetcher: async () => ({ value: [] }),
        },
      });

      const requests = Array.from({ length: 50 }, (_, i) => {
        // Alternate between safe proposals (100 bps) and MEV unsafe proposals (400 bps)
        const slippage = i % 2 === 0 ? 100 : 400;
        return plugin.auditTradeProposal({
          targetMint: dummyMint,
          expectedOutput: 1000 + i,
          maxSlippageBps: slippage,
        });
      });

      const results = await Promise.all(requests);
      expect(results).toHaveLength(50);

      results.forEach((report, i) => {
        if (i % 2 === 0) {
          expect(report.decision).toBe('APPROVED');
          expect(report.breakdown.mevGuard.slippageBps).toBe(100);
        } else {
          expect(report.decision).toBe('BLOCKED');
          expect(report.breakdown.mevGuard.slippageBps).toBe(400);
        }
      });
    });

    test('MCP server handles malformed inputs safely via tool invocation', async () => {
      const server = await startMcpServer();
      const callHandler = (server as any)._requestHandlers.get(CallToolRequestSchema.shape.method.value);

      // 1. Missing targetMint
      const resMissingMint = await callHandler({
        method: 'tools/call',
        params: {
          name: 'audit_solana_trade',
          arguments: { expectedOutput: 1000 },
        },
      });
      expect(resMissingMint.isError).toBe(true);
      expect(resMissingMint.content[0].text).toContain('Target mint must be a valid Solana base58 address');

      // 2. Negative expected output
      const resNegOutput = await callHandler({
        method: 'tools/call',
        params: {
          name: 'audit_solana_trade',
          arguments: { targetMint: dummyMint, expectedOutput: -50 },
        },
      });
      expect(resNegOutput.isError).toBe(true);
      expect(resNegOutput.content[0].text).toContain('Expected output must be greater than zero');

      // 3. Excess slippage bps (> 10000)
      const resBadSlippage = await callHandler({
        method: 'tools/call',
        params: {
          name: 'audit_solana_trade',
          arguments: { targetMint: dummyMint, expectedOutput: 1000, maxSlippageBps: 20000 },
        },
      });
      expect(resBadSlippage.isError).toBe(true);
      expect(resBadSlippage.content[0].text).toContain('Max slippage cannot exceed 100%');
    });
  });
});
