import { Connection, PublicKey, Keypair, Transaction, SystemProgram } from '@solana/web3.js';
import * as splToken from '@solana/spl-token';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { SolInquisitorPlugin } from '../src/plugin';
import { startMcpServer } from '../src/mcp/server';
import { probeRugRisks } from '../src/modules/rugProbe';
import { simulateAndVerifyProposal } from '../src/modules/simulation';
import { assessMevRisk } from '../src/modules/mevGuard';
import {
  TradeProposalSchema,
  RugProbeInputSchema,
  MevGuardInputSchema,
  AdversarialAuditReport,
} from '../src/types';

jest.mock('@solana/spl-token', () => {
  const actual = jest.requireActual('@solana/spl-token');
  return {
    ...actual,
    getMint: jest.fn(),
  };
});

// ============================================================================
// TEST FIXTURES & ISOLATED HARNESS HELPERS (100% OFFLINE)
// ============================================================================

function createMockConnection(options?: {
  largestAccounts?: Array<{ address: PublicKey; amount: string; uiAmount?: number }>;
  simulateErr?: unknown;
  simulateLogs?: string[];
  simulateUnits?: number;
}): Connection {
  return {
    getTokenLargestAccounts: jest.fn().mockResolvedValue({
      value: options?.largestAccounts || [],
    }),
    simulateTransaction: jest.fn().mockResolvedValue({
      value: {
        err: options?.simulateErr !== undefined ? options.simulateErr : null,
        logs: options?.simulateLogs || ['Program TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA success'],
        unitsConsumed: options?.simulateUnits ?? 25000,
      },
    }),
  } as unknown as Connection;
}

function createMockWireTx(): string {
  const tx = new Transaction();
  tx.recentBlockhash = Keypair.generate().publicKey.toBase58();
  tx.feePayer = Keypair.generate().publicKey;
  tx.add(
    SystemProgram.transfer({
      fromPubkey: tx.feePayer,
      toPubkey: Keypair.generate().publicKey,
      lamports: 1000,
    })
  );
  return tx.serialize({ requireAllSignatures: false, verifySignatures: false }).toString('base64');
}

function mockCleanMint(mintAddress: string, supply: bigint = BigInt(1_000_000)) {
  (splToken.getMint as jest.Mock).mockResolvedValue({
    address: new PublicKey(mintAddress),
    mintAuthority: null,
    freezeAuthority: null,
    supply,
    decimals: 6,
    isInitialized: true,
    tlvData: Buffer.alloc(0),
  });
}

// ============================================================================
// SUITE: OPAQUE-BOX E2E REQUIREMENT-DRIVEN TESTS (TIERS 1 - 4)
// ============================================================================

describe('Sol-Inquisitor Opaque-Box E2E Test Suite', () => {
  let mockConn: Connection;
  let plugin: SolInquisitorPlugin;
  const testMint = Keypair.generate().publicKey.toBase58();

  beforeEach(() => {
    jest.clearAllMocks();
    mockConn = createMockConnection();
    plugin = new SolInquisitorPlugin({ connection: mockConn });
  });

  // ==========================================================================
  // TIER 1: FEATURE COVERAGE (>=5 tests per requirement across R1-R4)
  // ==========================================================================
  describe('Tier 1: Feature Coverage', () => {
    // ------------------------------------------------------------------------
    // Feature R1: Honeypot & Rug Falsification Engine
    // ------------------------------------------------------------------------
    describe('R1. Honeypot & Rug Falsification Engine', () => {
      test('T1.1: Detects active freezeAuthority (+45 risk) and vetoes trade proposal', async () => {
        const mockFreeze = Keypair.generate().publicKey;
        (splToken.getMint as jest.Mock).mockResolvedValue({
          address: new PublicKey(testMint),
          mintAuthority: null,
          freezeAuthority: mockFreeze,
          supply: BigInt(500000),
          decimals: 6,
          isInitialized: true,
        });

        const report = await plugin.auditTradeProposal({
          targetMint: testMint,
          expectedOutput: 1000,
          maxSlippageBps: 100,
        });

        expect(report.decision).toBe('BLOCKED');
        expect(report.overallRiskScore).toBeGreaterThanOrEqual(45);
        expect(report.breakdown.rugProbe.hasFreezeAuthority).toBe(true);
        expect(report.breakdown.rugProbe.freezeAuthority).toBe(mockFreeze.toBase58());
        expect(report.breakdown.rugProbe.freezeRiskScore).toBe(45);
        expect(report.breakdown.rugProbe.isUnsafe).toBe(true);
        expect(report.vetoReasons.some((r) => r.includes('Freeze Authority detected'))).toBe(true);
        expect(report.recommendations.some((r) => r.includes('Refuse trading: Honeypot hazard'))).toBe(true);
      });

      test('T1.2: Detects active mintAuthority (+35 risk) and records authority address', async () => {
        const mockMintAuth = Keypair.generate().publicKey;
        (splToken.getMint as jest.Mock).mockResolvedValue({
          address: new PublicKey(testMint),
          mintAuthority: mockMintAuth,
          freezeAuthority: null,
          supply: BigInt(1000000),
          decimals: 6,
          isInitialized: true,
        });

        const rugReport = await plugin.probeRug(testMint);

        expect(rugReport.hasMintAuthority).toBe(true);
        expect(rugReport.mintAuthority).toBe(mockMintAuth.toBase58());
        expect(rugReport.mintRiskScore).toBe(35);
        expect(rugReport.hasFreezeAuthority).toBe(false);
        expect(rugReport.freezeRiskScore).toBe(0);
        expect(rugReport.reasons.some((r) => r.includes('Mint Authority detected'))).toBe(true);
      });

      test('T1.3: Evaluates whale concentration tiers: >=80% (+30), >=50% (+20), >=35% (+10)', async () => {
        // Test Tier >= 80% (+30)
        (splToken.getMint as jest.Mock).mockResolvedValue({
          address: new PublicKey(testMint),
          mintAuthority: null,
          freezeAuthority: null,
          supply: BigInt(10000),
          decimals: 6,
          isInitialized: true,
        });

        const whaleConn80 = createMockConnection({
          largestAccounts: [
            { address: Keypair.generate().publicKey, amount: '8500', uiAmount: 8.5 },
          ],
        });
        const report80 = await probeRugRisks(whaleConn80, testMint);
        expect(report80.topHoldersSharePercentage).toBe(85);
        expect(report80.concentrationRiskScore).toBe(30);

        // Test Tier >= 50% (+20)
        const whaleConn50 = createMockConnection({
          largestAccounts: [
            { address: Keypair.generate().publicKey, amount: '6000', uiAmount: 6.0 },
          ],
        });
        const report50 = await probeRugRisks(whaleConn50, testMint);
        expect(report50.topHoldersSharePercentage).toBe(60);
        expect(report50.concentrationRiskScore).toBe(20);

        // Test Tier >= 35% (+10)
        const whaleConn35 = createMockConnection({
          largestAccounts: [
            { address: Keypair.generate().publicKey, amount: '4000', uiAmount: 4.0 },
          ],
        });
        const report35 = await probeRugRisks(whaleConn35, testMint);
        expect(report35.topHoldersSharePercentage).toBe(40);
        expect(report35.concentrationRiskScore).toBe(10);
      });

      test('T1.4: Honeypot Decision Rule: mintAuthority (+35) + whale concentration (+10) = 45 >= 40 UNSAFE', async () => {
        const mockMintAuth = Keypair.generate().publicKey;
        (splToken.getMint as jest.Mock).mockResolvedValue({
          address: new PublicKey(testMint),
          mintAuthority: mockMintAuth,
          freezeAuthority: null,
          supply: BigInt(10000),
          decimals: 6,
          isInitialized: true,
        });

        const connWithHolders = createMockConnection({
          largestAccounts: [
            { address: Keypair.generate().publicKey, amount: '4000', uiAmount: 4.0 }, // 40% -> +10
          ],
        });
        const customPlugin = new SolInquisitorPlugin({ connection: connWithHolders });
        const report = await customPlugin.auditTradeProposal({
          targetMint: testMint,
          expectedOutput: 500,
          maxSlippageBps: 100,
        });

        expect(report.breakdown.rugProbe.totalRiskScore).toBe(45);
        expect(report.breakdown.rugProbe.isUnsafe).toBe(true);
        expect(report.decision).toBe('BLOCKED');
        expect(report.verdict).toContain('VETO: Transaction proposal rejected');
      });

      test('T1.5: Approves clean decentralized token with revoked authorities and low holder share', async () => {
        mockCleanMint(testMint);
        const lowShareConn = createMockConnection({
          largestAccounts: [
            { address: Keypair.generate().publicKey, amount: '20000', uiAmount: 20 }, // 2% of 1M
          ],
        });
        const cleanPlugin = new SolInquisitorPlugin({ connection: lowShareConn });
        const report = await cleanPlugin.auditTradeProposal({
          targetMint: testMint,
          expectedOutput: 10000,
          maxSlippageBps: 50,
        });

        expect(report.decision).toBe('APPROVED');
        expect(report.verdict).toContain('PASSED: Transaction proposal cleared');
        expect(report.overallRiskScore).toBeLessThan(40);
        expect(report.breakdown.rugProbe.isUnsafe).toBe(false);
        expect(report.vetoReasons).toHaveLength(0);
      });

      test('T1.6: Fail-Secure Fallback: on-chain RPC error triggers default 100 risk and veto', async () => {
        (splToken.getMint as jest.Mock).mockRejectedValue(new Error('Network RPC unreachable'));

        const report = await plugin.auditTradeProposal({
          targetMint: testMint,
          expectedOutput: 1000,
          maxSlippageBps: 100,
        });

        expect(report.decision).toBe('BLOCKED');
        expect(report.overallRiskScore).toBe(100);
        expect(report.breakdown.rugProbe.isUnsafe).toBe(true);
        expect(report.vetoReasons.some((r) => r.includes('fail-secure protocol'))).toBe(true);
      });
    });

    // ------------------------------------------------------------------------
    // Feature R2: Pre-Flight Simulation & Balance Delta Diffing
    // ------------------------------------------------------------------------
    describe('R2. Pre-Flight Simulation & Balance Delta Diffing', () => {
      test('T1.7: Approves when simulated balance delta satisfies expected output and slippage', async () => {
        const simReport = await simulateAndVerifyProposal({
          connection: mockConn,
          targetMint: testMint,
          expectedOutput: 1000,
          maxSlippageBps: 100, // 1% allowed => minAcceptable 990
          mockOverride: {
            err: null,
            logs: ['Program Token success'],
            unitsConsumed: 22000,
            preBalance: 0,
            postBalance: 995, // 995 >= 990
          },
        });

        expect(simReport.simulatedSuccess).toBe(true);
        expect(simReport.vetoed).toBe(false);
        expect(simReport.actualOutputDelta).toBe(995);
        expect(simReport.minAcceptableOutput).toBe(990);
        expect(simReport.slippageExceeded).toBe(false);
      });

      test('T1.8: Vetoes transaction when actual balance delta violates slippage bounds', async () => {
        const simReport = await simulateAndVerifyProposal({
          connection: mockConn,
          targetMint: testMint,
          expectedOutput: 1000,
          maxSlippageBps: 100, // minAcceptable 990
          mockOverride: {
            err: null,
            logs: ['Program Token success'],
            unitsConsumed: 22000,
            preBalance: 0,
            postBalance: 960, // 960 < 990 (4% slippage observed)
          },
        });

        expect(simReport.simulatedSuccess).toBe(true);
        expect(simReport.slippageExceeded).toBe(true);
        expect(simReport.vetoed).toBe(true);
        expect(simReport.actualOutputDelta).toBe(960);
        expect(simReport.reasons.some((r) => r.includes('Pre-flight balance delta violation'))).toBe(true);
      });

      test('T1.9: Vetoes transaction when simulation reverts on-chain with InstructionError', async () => {
        const simReport = await simulateAndVerifyProposal({
          connection: mockConn,
          targetMint: testMint,
          expectedOutput: 500,
          maxSlippageBps: 50,
          mockOverride: {
            err: { InstructionError: [1, 'Custom(6001)'] },
            logs: ['Program log: SlippageExceededInPool', 'Program failed'],
            unitsConsumed: 12000,
          },
        });

        expect(simReport.simulatedSuccess).toBe(false);
        expect(simReport.vetoed).toBe(true);
        expect(simReport.reasons.some((r) => r.includes('Simulation reverted on-chain'))).toBe(true);
      });

      test('T1.10: Directly simulates raw Base64 wire transaction via connection.simulateTransaction', async () => {
        mockCleanMint(testMint);
        const wireTx = createMockWireTx();
        const simConn = createMockConnection({
          simulateUnits: 31000,
          simulateLogs: ['Instruction: TransferChecked', 'Program return: success'],
        });
        const simPlugin = new SolInquisitorPlugin({ connection: simConn });

        const report = await simPlugin.auditTradeProposal({
          targetMint: testMint,
          expectedOutput: 2000,
          maxSlippageBps: 50,
          transactionBase64: wireTx,
        });

        expect(simConn.simulateTransaction).toHaveBeenCalled();
        expect(report.breakdown.simulation).not.toBeNull();
        expect(report.breakdown.simulation?.simulatedSuccess).toBe(true);
        expect(report.breakdown.simulation?.unitsConsumed).toBe(31000);
        expect(report.decision).toBe('APPROVED');
      });

      test('T1.11: Parameter dry-run proposal executes audit cleanly without raw wire transaction', async () => {
        mockCleanMint(testMint);
        const report = await plugin.auditTradeProposal({
          targetMint: testMint,
          expectedOutput: 5000,
          maxSlippageBps: 100,
        });

        expect(report.decision).toBe('APPROVED');
        expect(report.breakdown.simulation).toBeNull();
      });

      test('T1.12: Catches simulation RPC connection exceptions and issues fail-secure veto', async () => {
        mockCleanMint(testMint);
        const wireTx = createMockWireTx();
        const failingConn = {
          getTokenLargestAccounts: jest.fn().mockResolvedValue({ value: [] }),
          simulateTransaction: jest.fn().mockRejectedValue(new Error('Solana RPC HTTP 503 Service Unavailable')),
        } as unknown as Connection;

        const failPlugin = new SolInquisitorPlugin({ connection: failingConn });
        const report = await failPlugin.auditTradeProposal({
          targetMint: testMint,
          expectedOutput: 1000,
          maxSlippageBps: 100,
          transactionBase64: wireTx,
        });

        expect(report.decision).toBe('BLOCKED');
        expect(report.breakdown.simulation?.simulatedSuccess).toBe(false);
        expect(report.breakdown.simulation?.vetoed).toBe(true);
        expect(report.vetoReasons.some((r) => r.includes('RPC simulateTransaction call failed'))).toBe(true);
      });
    });

    // ------------------------------------------------------------------------
    // Feature R3: MEV Sandwich Stress Guard
    // ------------------------------------------------------------------------
    describe('R3. MEV Sandwich Stress Guard', () => {
      test('T1.13: Stratifies low slippage: <=50 bps (score 5, LOW) and 51-150 bps (score 15, LOW)', () => {
        const reportTight = assessMevRisk({ maxSlippageBps: 30 });
        expect(reportTight.riskLevel).toBe('LOW');
        expect(reportTight.mevRiskScore).toBe(5);
        expect(reportTight.sandwichVulnerability).toBe(false);

        const reportStd = assessMevRisk({ maxSlippageBps: 100 });
        expect(reportStd.riskLevel).toBe('LOW');
        expect(reportStd.mevRiskScore).toBe(15);
        expect(reportStd.sandwichVulnerability).toBe(false);
      });

      test('T1.14: Stratifies medium slippage: 151-300 bps (score 45, MEDIUM)', () => {
        const reportMed = assessMevRisk({ maxSlippageBps: 200 });
        expect(reportMed.riskLevel).toBe('MEDIUM');
        expect(reportMed.mevRiskScore).toBe(45);
        expect(reportMed.sandwichVulnerability).toBe(false);
        expect(reportMed.reasons.some((r) => r.includes('Moderate slippage tolerance'))).toBe(true);
      });

      test('T1.15: Stratifies high slippage: 301-500 bps (score 75, HIGH, sandwich: true)', () => {
        const reportHigh = assessMevRisk({ maxSlippageBps: 400 });
        expect(reportHigh.riskLevel).toBe('HIGH');
        expect(reportHigh.mevRiskScore).toBe(75);
        expect(reportHigh.sandwichVulnerability).toBe(true);
        expect(reportHigh.reasons.some((r) => r.includes('High slippage tolerance'))).toBe(true);
      });

      test('T1.16: Stratifies critical slippage: >500 bps (score 95, CRITICAL) and triggers plugin veto', async () => {
        mockCleanMint(testMint);
        const mevReport = assessMevRisk({ maxSlippageBps: 600 });
        expect(mevReport.riskLevel).toBe('CRITICAL');
        expect(mevReport.mevRiskScore).toBe(95);
        expect(mevReport.sandwichVulnerability).toBe(true);

        const report = await plugin.auditTradeProposal({
          targetMint: testMint,
          expectedOutput: 1000,
          maxSlippageBps: 600, // 6%
        });

        expect(report.decision).toBe('BLOCKED');
        expect(report.vetoReasons.some((r) => r.includes('MEV Guard flagged high sandwich risk'))).toBe(true);
        expect(report.recommendations.some((r) => r.includes('Reduce slippage tolerance'))).toBe(true);
      });

      test('T1.17: Calculates recommendedMaxSlippageBps (capped at 100) and extractable value BPS', () => {
        const mevReport = assessMevRisk({ maxSlippageBps: 250 });
        expect(mevReport.recommendedMaxSlippageBps).toBe(100);
        // Extractable value: round((250 - 30) * 0.8) = round(220 * 0.8) = 176
        expect(mevReport.estimatedExtractableValueBps).toBe(176);
      });

      test('T1.18: Adds large trade size USD penalty (+15 risk score) for tradeSizeUsd > $10,000', () => {
        const reportLarge = assessMevRisk({
          maxSlippageBps: 200,
          tradeSizeUsd: 25000,
        });

        // 45 baseline + 15 large size = 60
        expect(reportLarge.mevRiskScore).toBe(60);
        expect(reportLarge.reasons.some((r) => r.includes('Large order size'))).toBe(true);
      });
    });

    // ------------------------------------------------------------------------
    // Feature R4: SAK V2 Plugin & Native MCP Server
    // ------------------------------------------------------------------------
    describe('R4. Solana Agent Kit V2 Plugin & Native MCP Server', () => {
      test('T1.19: Exposes valid Solana Agent Kit V2 plugin metadata and 3 structured actions', () => {
        expect(plugin.name).toBe('adversary_inquisitor');
        expect(typeof plugin.description).toBe('string');
        expect(plugin.description.length).toBeGreaterThan(20);

        const actionNames = plugin.actions.map((a) => a.name);
        expect(actionNames).toHaveLength(3);
        expect(actionNames).toContain('audit_trade_proposal');
        expect(actionNames).toContain('probe_token_rug');
        expect(actionNames).toContain('assess_mev_risk');

        for (const action of plugin.actions) {
          expect(typeof action.name).toBe('string');
          expect(typeof action.description).toBe('string');
          expect(Array.isArray(action.similes)).toBe(true);
          expect(action.similes.length).toBeGreaterThan(0);
          expect(Array.isArray(action.examples)).toBe(true);
          expect(action.examples.length).toBeGreaterThan(0);
          expect(action.schema).toBeDefined();
          expect(typeof action.handler).toBe('function');
        }
      });

      test('T1.20: Executes all 3 plugin action handlers successfully', async () => {
        mockCleanMint(testMint);

        const auditAction = plugin.actions.find((a) => a.name === 'audit_trade_proposal')!;
        const auditResult = (await auditAction.handler(null, {
          targetMint: testMint,
          expectedOutput: 2000,
          maxSlippageBps: 50,
        })) as AdversarialAuditReport;
        expect(auditResult.decision).toBe('APPROVED');

        const probeAction = plugin.actions.find((a) => a.name === 'probe_token_rug')!;
        const probeResult = (await probeAction.handler(null, { targetMint: testMint })) as any;
        expect(probeResult.mint).toBe(testMint);
        expect(probeResult.isUnsafe).toBe(false);

        const mevAction = plugin.actions.find((a) => a.name === 'assess_mev_risk')!;
        const mevResult = (await mevAction.handler(null, { maxSlippageBps: 400 })) as any;
        expect(mevResult.riskLevel).toBe('HIGH');
      });

      test('T1.21: Initializes native MCP Server and exposes tool listing for all 3 tools', async () => {
        const server = await startMcpServer(plugin);
        const [cTrans, sTrans] = InMemoryTransport.createLinkedPair();
        const client = new Client({ name: 'mcp-test-client', version: '1.0.0' }, { capabilities: {} });

        await Promise.all([server.connect(sTrans), client.connect(cTrans)]);

        const listResult = await client.listTools();
        const toolNames = listResult.tools.map((t) => t.name);

        expect(toolNames).toContain('audit_solana_trade');
        expect(toolNames).toContain('probe_token_rug');
        expect(toolNames).toContain('assess_mev_risk');

        const auditTool = listResult.tools.find((t) => t.name === 'audit_solana_trade')!;
        expect(auditTool.inputSchema.properties).toHaveProperty('targetMint');
        expect(auditTool.inputSchema.properties).toHaveProperty('expectedOutput');
        expect(auditTool.inputSchema.required).toContain('targetMint');
        expect(auditTool.inputSchema.required).toContain('expectedOutput');

        await client.close();
      });

      test('T1.22: Invokes MCP tool audit_solana_trade and receives structured audit JSON report', async () => {
        mockCleanMint(testMint);
        const server = await startMcpServer(plugin);
        const [cTrans, sTrans] = InMemoryTransport.createLinkedPair();
        const client = new Client({ name: 'mcp-test-client', version: '1.0.0' }, { capabilities: {} });

        await Promise.all([server.connect(sTrans), client.connect(cTrans)]);

        const callResult = (await client.callTool({
          name: 'audit_solana_trade',
          arguments: {
            targetMint: testMint,
            expectedOutput: 1500,
            maxSlippageBps: 75,
          },
        })) as any;

        expect(callResult.content).toBeDefined();
        expect(callResult.content[0].type).toBe('text');
        const report = JSON.parse(callResult.content[0].text);
        expect(report.decision).toBe('APPROVED');
        expect(report.overallRiskScore).toBeLessThan(40);

        await client.close();
      });

      test('T1.23: Invokes MCP tools probe_token_rug and assess_mev_risk successfully', async () => {
        mockCleanMint(testMint);
        const server = await startMcpServer(plugin);
        const [cTrans, sTrans] = InMemoryTransport.createLinkedPair();
        const client = new Client({ name: 'mcp-test-client', version: '1.0.0' }, { capabilities: {} });

        await Promise.all([server.connect(sTrans), client.connect(cTrans)]);

        const rugRes = (await client.callTool({
          name: 'probe_token_rug',
          arguments: { targetMint: testMint },
        })) as any;
        const rugReport = JSON.parse(rugRes.content[0].text);
        expect(rugReport.mint).toBe(testMint);
        expect(rugReport.isUnsafe).toBe(false);

        const mevRes = (await client.callTool({
          name: 'assess_mev_risk',
          arguments: { maxSlippageBps: 600 },
        })) as any;
        const mevReport = JSON.parse(mevRes.content[0].text);
        expect(mevReport.riskLevel).toBe('CRITICAL');
        expect(mevReport.sandwichVulnerability).toBe(true);

        await client.close();
      });

      test('T1.24: Handles unknown MCP tools or missing parameters with error protocol', async () => {
        const server = await startMcpServer(plugin);
        const [cTrans, sTrans] = InMemoryTransport.createLinkedPair();
        const client = new Client({ name: 'mcp-test-client', version: '1.0.0' }, { capabilities: {} });

        await Promise.all([server.connect(sTrans), client.connect(cTrans)]);

        const errorResult = (await client.callTool({
          name: 'invalid_unrecognized_tool',
          arguments: {},
        })) as any;

        expect(errorResult.isError).toBe(true);
        expect(errorResult.content[0].text).toContain('Unknown tool: invalid_unrecognized_tool');

        await client.close();
      });
    });
  });

  // ==========================================================================
  // TIER 2: BOUNDARY & CORNER CASES (>=5 per requirement across R1-R4)
  // ==========================================================================
  describe('Tier 2: Boundary & Corner Cases', () => {
    // ------------------------------------------------------------------------
    // Feature R1 Boundaries
    // ------------------------------------------------------------------------
    describe('R1 Boundaries', () => {
      test('T2.1: Validates Solana Base58 mint length boundaries (32 and 44 valid; 31 and 45 rejected)', () => {
        const mint32 = '11111111111111111111111111111111'; // 32 chars
        expect(mint32.length).toBe(32);
        expect(TradeProposalSchema.safeParse({ targetMint: mint32, expectedOutput: 100 }).success).toBe(true);

        const mint44 = 'Gw6M4bboAENvMJv3FYTYxvK95hdgzTZPvDPgQjXSEu2U'; // 44 chars
        expect(mint44.length).toBe(44);
        expect(TradeProposalSchema.safeParse({ targetMint: mint44, expectedOutput: 100 }).success).toBe(true);

        const mint31 = '1'.repeat(31);
        expect(TradeProposalSchema.safeParse({ targetMint: mint31, expectedOutput: 100 }).success).toBe(false);

        const mint45 = '1'.repeat(45);
        expect(TradeProposalSchema.safeParse({ targetMint: mint45, expectedOutput: 100 }).success).toBe(false);
      });

      test('T2.2: Concentration boundary at exactly 35.00%: 34.99% gives 0 penalty, 35.00% gives +10', async () => {
        (splToken.getMint as jest.Mock).mockResolvedValue({
          address: new PublicKey(testMint),
          mintAuthority: null,
          freezeAuthority: null,
          supply: BigInt(1000000),
          decimals: 6,
          isInitialized: true,
        });

        // Case A: 349,900 / 1,000,000 = 34.99% -> 0
        const conn3499 = createMockConnection({
          largestAccounts: [{ address: Keypair.generate().publicKey, amount: '349900' }],
        });
        const rep3499 = await probeRugRisks(conn3499, testMint);
        expect(rep3499.concentrationRiskScore).toBe(0);

        // Case B: 350,000 / 1,000,000 = 35.00% -> +10
        const conn3500 = createMockConnection({
          largestAccounts: [{ address: Keypair.generate().publicKey, amount: '350000' }],
        });
        const rep3500 = await probeRugRisks(conn3500, testMint);
        expect(rep3500.concentrationRiskScore).toBe(10);
      });

      test('T2.3: Concentration boundary at exactly 50.00%: 49.99% gives +10, 50.00% gives +20', async () => {
        (splToken.getMint as jest.Mock).mockResolvedValue({
          address: new PublicKey(testMint),
          mintAuthority: null,
          freezeAuthority: null,
          supply: BigInt(1000000),
          decimals: 6,
          isInitialized: true,
        });

        // 49.99% -> +10
        const conn4999 = createMockConnection({
          largestAccounts: [{ address: Keypair.generate().publicKey, amount: '499900' }],
        });
        const rep4999 = await probeRugRisks(conn4999, testMint);
        expect(rep4999.concentrationRiskScore).toBe(10);

        // 50.00% -> +20
        const conn5000 = createMockConnection({
          largestAccounts: [{ address: Keypair.generate().publicKey, amount: '500000' }],
        });
        const rep5000 = await probeRugRisks(conn5000, testMint);
        expect(rep5000.concentrationRiskScore).toBe(20);
      });

      test('T2.4: Concentration boundary at exactly 80.00%: 79.99% gives +20, 80.00% gives +30', async () => {
        (splToken.getMint as jest.Mock).mockResolvedValue({
          address: new PublicKey(testMint),
          mintAuthority: null,
          freezeAuthority: null,
          supply: BigInt(1000000),
          decimals: 6,
          isInitialized: true,
        });

        // 79.99% -> +20
        const conn7999 = createMockConnection({
          largestAccounts: [{ address: Keypair.generate().publicKey, amount: '799900' }],
        });
        const rep7999 = await probeRugRisks(conn7999, testMint);
        expect(rep7999.concentrationRiskScore).toBe(20);

        // 80.00% -> +30
        const conn8000 = createMockConnection({
          largestAccounts: [{ address: Keypair.generate().publicKey, amount: '800000' }],
        });
        const rep8000 = await probeRugRisks(conn8000, testMint);
        expect(rep8000.concentrationRiskScore).toBe(30);
      });

      test('T2.5: Zero supply & empty holders: prevents division by zero and returns 0% concentration', async () => {
        (splToken.getMint as jest.Mock).mockResolvedValue({
          address: new PublicKey(testMint),
          mintAuthority: null,
          freezeAuthority: null,
          supply: BigInt(0),
          decimals: 6,
          isInitialized: true,
        });

        const emptyConn = createMockConnection({ largestAccounts: [] });
        const rep = await probeRugRisks(emptyConn, testMint);

        expect(rep.topHoldersSharePercentage).toBe(0);
        expect(rep.concentrationRiskScore).toBe(0);
        expect(rep.totalRiskScore).toBe(0);
        expect(rep.isUnsafe).toBe(false);
      });

      test('T2.6: Custom threshold override: configuring rugScoreThreshold: 70 changes decision boundary', async () => {
        const mockMintAuth = Keypair.generate().publicKey;
        (splToken.getMint as jest.Mock).mockResolvedValue({
          address: new PublicKey(testMint),
          mintAuthority: mockMintAuth, // +35
          freezeAuthority: null,
          supply: BigInt(100000),
          decimals: 6,
          isInitialized: true,
        });

        const holderConn = createMockConnection({
          largestAccounts: [{ address: Keypair.generate().publicKey, amount: '35000' }], // 35% -> +10
        });

        // Total risk = 35 + 10 = 45. Default threshold is 40 (unsafe).
        const defaultPlugin = new SolInquisitorPlugin({ connection: holderConn });
        const defReport = await defaultPlugin.auditTradeProposal({
          targetMint: testMint,
          expectedOutput: 100,
          maxSlippageBps: 100,
        });
        expect(defReport.decision).toBe('BLOCKED');

        // With custom threshold 70, risk 45 is acceptable (< 70).
        const customPlugin = new SolInquisitorPlugin({
          connection: holderConn,
          rugScoreThreshold: 70,
        });
        const customReport = await customPlugin.auditTradeProposal({
          targetMint: testMint,
          expectedOutput: 100,
          maxSlippageBps: 100,
        });
        expect(customReport.decision).toBe('APPROVED');
      });
    });

    // ------------------------------------------------------------------------
    // Feature R2 Boundaries
    // ------------------------------------------------------------------------
    describe('R2 Boundaries', () => {
      test('T2.7: Zero slippage boundary (maxSlippageBps = 0): requires exact output matching', async () => {
        // Exact match passes
        const passReport = await simulateAndVerifyProposal({
          connection: mockConn,
          targetMint: testMint,
          expectedOutput: 500,
          maxSlippageBps: 0,
          mockOverride: { preBalance: 0, postBalance: 500 },
        });
        expect(passReport.minAcceptableOutput).toBe(500);
        expect(passReport.slippageExceeded).toBe(false);
        expect(passReport.vetoed).toBe(false);

        // Deficit of 1 unit vetoes
        const failReport = await simulateAndVerifyProposal({
          connection: mockConn,
          targetMint: testMint,
          expectedOutput: 500,
          maxSlippageBps: 0,
          mockOverride: { preBalance: 0, postBalance: 499 },
        });
        expect(failReport.slippageExceeded).toBe(true);
        expect(failReport.vetoed).toBe(true);
      });

      test('T2.8: Maximum allowable slippage boundary (maxSlippageBps = 10000): minAcceptable is 0', async () => {
        const report = await simulateAndVerifyProposal({
          connection: mockConn,
          targetMint: testMint,
          expectedOutput: 1000,
          maxSlippageBps: 10000, // 100% slippage allowed
          mockOverride: { preBalance: 0, postBalance: 0 },
        });

        expect(report.minAcceptableOutput).toBe(0);
        expect(report.actualOutputDelta).toBe(0);
        expect(report.slippageExceeded).toBe(false);
        expect(report.vetoed).toBe(false);
      });

      test('T2.9: Exact off-by-one balance delta boundary: minAcceptableOutput vs minAcceptableOutput - 1', async () => {
        // Expected: 1000, Slippage: 100 bps (1%) => minAcceptable: 990
        const exactMatch = await simulateAndVerifyProposal({
          connection: mockConn,
          targetMint: testMint,
          expectedOutput: 1000,
          maxSlippageBps: 100,
          mockOverride: { preBalance: 0, postBalance: 990 },
        });
        expect(exactMatch.slippageExceeded).toBe(false);
        expect(exactMatch.vetoed).toBe(false);

        const oneBelow = await simulateAndVerifyProposal({
          connection: mockConn,
          targetMint: testMint,
          expectedOutput: 1000,
          maxSlippageBps: 100,
          mockOverride: { preBalance: 0, postBalance: 989 },
        });
        expect(oneBelow.slippageExceeded).toBe(true);
        expect(oneBelow.vetoed).toBe(true);
      });

      test('T2.10: Corrupted or non-base64 transaction string handled gracefully with error report', async () => {
        const report = await simulateAndVerifyProposal({
          connection: mockConn,
          targetMint: testMint,
          expectedOutput: 500,
          maxSlippageBps: 100,
          transaction: '!!!NOT_A_VALID_BASE64_SOLANA_WIRE_TRANSACTION!!!',
        });

        expect(report.simulatedSuccess).toBe(false);
        expect(report.vetoed).toBe(true);
        expect(report.reasons.some((r) => r.includes('Transaction deserialization failed'))).toBe(true);
      });

      test('T2.11: Simulation with empty logs and zero unitsConsumed handles cleanly', async () => {
        const report = await simulateAndVerifyProposal({
          connection: mockConn,
          targetMint: testMint,
          expectedOutput: 300,
          maxSlippageBps: 50,
          mockOverride: {
            err: null,
            logs: [],
            unitsConsumed: 0,
            preBalance: 0,
            postBalance: 300,
          },
        });

        expect(report.simulatedSuccess).toBe(true);
        expect(report.unitsConsumed).toBe(0);
        expect(report.logs).toHaveLength(0);
        expect(report.vetoed).toBe(false);
      });
    });

    // ------------------------------------------------------------------------
    // Feature R3 Boundaries
    // ------------------------------------------------------------------------
    describe('R3 Boundaries', () => {
      test('T2.12: Exact MEV slippage tier step transitions (50, 51, 150, 151, 300, 301, 500, 501 bps)', () => {
        expect(assessMevRisk({ maxSlippageBps: 50 }).mevRiskScore).toBe(5);
        expect(assessMevRisk({ maxSlippageBps: 51 }).mevRiskScore).toBe(15);
        expect(assessMevRisk({ maxSlippageBps: 150 }).mevRiskScore).toBe(15);
        expect(assessMevRisk({ maxSlippageBps: 151 }).mevRiskScore).toBe(45);
        expect(assessMevRisk({ maxSlippageBps: 300 }).mevRiskScore).toBe(45);
        expect(assessMevRisk({ maxSlippageBps: 301 }).mevRiskScore).toBe(75);
        expect(assessMevRisk({ maxSlippageBps: 500 }).mevRiskScore).toBe(75);
        expect(assessMevRisk({ maxSlippageBps: 501 }).mevRiskScore).toBe(95);
      });

      test('T2.13: Trade size USD boundary at exactly $10,000: $10,000 has no penalty, $10,001 has +15', () => {
        const at10k = assessMevRisk({ maxSlippageBps: 200, tradeSizeUsd: 10000 });
        expect(at10k.mevRiskScore).toBe(45);

        const above10k = assessMevRisk({ maxSlippageBps: 200, tradeSizeUsd: 10001 });
        expect(above10k.mevRiskScore).toBe(60); // 45 + 15
      });

      test('T2.14: Baseline fair slippage extractable value at <=30 bps vs 31 bps vs 10,000 bps', () => {
        expect(assessMevRisk({ maxSlippageBps: 30 }).estimatedExtractableValueBps).toBe(0);
        expect(assessMevRisk({ maxSlippageBps: 20 }).estimatedExtractableValueBps).toBe(0);
        expect(assessMevRisk({ maxSlippageBps: 31 }).estimatedExtractableValueBps).toBe(1); // round(1 * 0.8) = 1
        expect(assessMevRisk({ maxSlippageBps: 10000 }).estimatedExtractableValueBps).toBe(7976); // round(9970 * 0.8)
      });

      test('T2.15: MEV risk score ceiling: score is clamped to a maximum of 100', () => {
        const report = assessMevRisk({
          maxSlippageBps: 600, // base 95
          tradeSizeUsd: 100000, // +15 bonus -> 110 clamped to 100
        });
        expect(report.mevRiskScore).toBe(100);
      });

      test('T2.16: Slippage Zod validation: rejects negative slippage (-1) and slippage exceeding 10,000 bps', () => {
        expect(MevGuardInputSchema.safeParse({ maxSlippageBps: 0 }).success).toBe(true);
        expect(MevGuardInputSchema.safeParse({ maxSlippageBps: 10000 }).success).toBe(true);
        expect(MevGuardInputSchema.safeParse({ maxSlippageBps: -1 }).success).toBe(false);
        expect(MevGuardInputSchema.safeParse({ maxSlippageBps: 10001 }).success).toBe(false);
      });
    });

    // ------------------------------------------------------------------------
    // Feature R4 Boundaries
    // ------------------------------------------------------------------------
    describe('R4 Boundaries', () => {
      test('T2.17: Rejects zero and negative expectedOutput in TradeProposalSchema', () => {
        expect(TradeProposalSchema.safeParse({ targetMint: testMint, expectedOutput: 1 }).success).toBe(true);
        expect(TradeProposalSchema.safeParse({ targetMint: testMint, expectedOutput: 0 }).success).toBe(false);
        expect(TradeProposalSchema.safeParse({ targetMint: testMint, expectedOutput: -10 }).success).toBe(false);
      });

      test('T2.18: Optional parameters schema default: omitting maxSlippageBps defaults to 100', () => {
        const parsed = TradeProposalSchema.parse({
          targetMint: testMint,
          expectedOutput: 500,
        });
        expect(parsed.maxSlippageBps).toBe(100);
        expect(parsed.walletPublicKey).toBeUndefined();
        expect(parsed.transactionBase64).toBeUndefined();
      });

      test('T2.19: MCP CallTool returns error when required arguments are missing', async () => {
        const server = await startMcpServer(plugin);
        const [cTrans, sTrans] = InMemoryTransport.createLinkedPair();
        const client = new Client({ name: 'mcp-test-client', version: '1.0.0' }, { capabilities: {} });

        await Promise.all([server.connect(sTrans), client.connect(cTrans)]);

        // Missing expectedOutput
        const result = (await client.callTool({
          name: 'audit_solana_trade',
          arguments: { targetMint: testMint },
        })) as any;

        expect(result.isError).toBe(true);
        expect(result.content[0].text).toContain('Sol-Inquisitor Error');

        await client.close();
      });

      test('T2.20: RugProbeInputSchema boundary: rejects targetMint string length < 32 or > 44', () => {
        expect(RugProbeInputSchema.safeParse({ targetMint: 'a'.repeat(32) }).success).toBe(true);
        expect(RugProbeInputSchema.safeParse({ targetMint: 'a'.repeat(44) }).success).toBe(true);
        expect(RugProbeInputSchema.safeParse({ targetMint: 'a'.repeat(31) }).success).toBe(false);
        expect(RugProbeInputSchema.safeParse({ targetMint: 'a'.repeat(45) }).success).toBe(false);
      });

      test('T2.21: MCP server handles unknown tool calls and non-existent methods safely', async () => {
        const server = await startMcpServer(plugin);
        const [cTrans, sTrans] = InMemoryTransport.createLinkedPair();
        const client = new Client({ name: 'mcp-test-client', version: '1.0.0' }, { capabilities: {} });

        await Promise.all([server.connect(sTrans), client.connect(cTrans)]);

        const result = (await client.callTool({
          name: 'unregistered_drain_attack',
          arguments: {},
        })) as any;

        expect(result.isError).toBe(true);
        expect(result.content[0].text).toContain('Unknown tool: unregistered_drain_attack');

        await client.close();
      });
    });
  });

  // ==========================================================================
  // TIER 3: CROSS-FEATURE COMBINATIONS (Pairwise Interactions, 8 tests)
  // ==========================================================================
  describe('Tier 3: Cross-Feature Combinations', () => {
    test('T3.1: Compound Threat: Freeze Authority (+45) + Critical MEV Slippage (600 bps)', async () => {
      const mockFreeze = Keypair.generate().publicKey;
      (splToken.getMint as jest.Mock).mockResolvedValue({
        address: new PublicKey(testMint),
        mintAuthority: null,
        freezeAuthority: mockFreeze,
        supply: BigInt(1000000),
        decimals: 6,
        isInitialized: true,
      });

      const report = await plugin.auditTradeProposal({
        targetMint: testMint,
        expectedOutput: 1000,
        maxSlippageBps: 600, // 6% critical MEV
      });

      expect(report.decision).toBe('BLOCKED');
      expect(report.overallRiskScore).toBe(95); // max(45, 95)
      expect(report.breakdown.rugProbe.hasFreezeAuthority).toBe(true);
      expect(report.breakdown.mevGuard.riskLevel).toBe('CRITICAL');
      expect(report.vetoReasons.some((r) => r.includes('Freeze Authority detected'))).toBe(true);
      expect(report.vetoReasons.some((r) => r.includes('MEV Guard flagged high sandwich risk'))).toBe(true);
    });

    test('T3.2: Safe Token with Unsafe Slippage (700 bps): RugProbe passes, MEV Guard blocks trade', async () => {
      mockCleanMint(testMint);

      const report = await plugin.auditTradeProposal({
        targetMint: testMint,
        expectedOutput: 5000,
        maxSlippageBps: 700,
      });

      expect(report.breakdown.rugProbe.isUnsafe).toBe(false);
      expect(report.breakdown.mevGuard.riskLevel).toBe('CRITICAL');
      expect(report.decision).toBe('BLOCKED');
      expect(report.recommendations.some((r) => r.includes('Reduce slippage tolerance'))).toBe(true);
    });

    test('T3.3: Unsafe Token with Ultra-Safe Slippage (10 bps): MEV Guard passes, RugProbe blocks trade', async () => {
      const mockAuth = Keypair.generate().publicKey;
      (splToken.getMint as jest.Mock).mockResolvedValue({
        address: new PublicKey(testMint),
        mintAuthority: mockAuth, // +35
        freezeAuthority: mockAuth, // +45
        supply: BigInt(500000),
        decimals: 6,
        isInitialized: true,
      });

      const report = await plugin.auditTradeProposal({
        targetMint: testMint,
        expectedOutput: 1000,
        maxSlippageBps: 10, // 0.1% tight slippage
      });

      expect(report.breakdown.mevGuard.riskLevel).toBe('LOW');
      expect(report.breakdown.rugProbe.totalRiskScore).toBeGreaterThanOrEqual(80);
      expect(report.decision).toBe('BLOCKED');
    });

    test('T3.4: Safe Token & Safe Slippage with Simulation Revert: Simulation triggers veto', async () => {
      mockCleanMint(testMint);
      const wireTx = createMockWireTx();
      const revertConn = createMockConnection({
        simulateErr: { InstructionError: [2, 'Custom(1)'] },
        simulateLogs: ['Program Tokenkeg aborted'],
      });

      const revertPlugin = new SolInquisitorPlugin({ connection: revertConn });
      const report = await revertPlugin.auditTradeProposal({
        targetMint: testMint,
        expectedOutput: 1000,
        maxSlippageBps: 50,
        transactionBase64: wireTx,
      });

      expect(report.breakdown.rugProbe.isUnsafe).toBe(false);
      expect(report.breakdown.mevGuard.riskLevel).toBe('LOW');
      expect(report.breakdown.simulation?.simulatedSuccess).toBe(false);
      expect(report.breakdown.simulation?.vetoed).toBe(true);
      expect(report.decision).toBe('BLOCKED');
    });

    test('T3.5: Safe Token & Safe Slippage with Simulation Balance Deficit: Simulation triggers veto', async () => {
      mockCleanMint(testMint);

      const simReport = await plugin.simulateProposal({
        connection: mockConn,
        targetMint: testMint,
        expectedOutput: 1000,
        maxSlippageBps: 100, // minAcceptable 990
      });

      // Default dry-run passes
      expect(simReport.vetoed).toBe(false);

      // Now verify with direct delta violation
      const violatedSim = await simulateAndVerifyProposal({
        connection: mockConn,
        targetMint: testMint,
        expectedOutput: 1000,
        maxSlippageBps: 100,
        mockOverride: { preBalance: 0, postBalance: 920 },
      });
      expect(violatedSim.vetoed).toBe(true);
      expect(violatedSim.slippageExceeded).toBe(true);
    });

    test('T3.6: Fail-Secure RPC Outage with Otherwise Safe Proposal: Vetoes proposal cleanly', async () => {
      (splToken.getMint as jest.Mock).mockRejectedValue(new Error('Connection reset by peer'));

      const report = await plugin.auditTradeProposal({
        targetMint: testMint,
        expectedOutput: 1000,
        maxSlippageBps: 50,
      });

      expect(report.decision).toBe('BLOCKED');
      expect(report.overallRiskScore).toBe(100);
      expect(report.breakdown.rugProbe.isUnsafe).toBe(true);
    });

    test('T3.7: SAK Plugin Action Handler with Wire Simulation: full end-to-end routing', async () => {
      mockCleanMint(testMint);
      const wireTx = createMockWireTx();
      const auditAction = plugin.actions.find((a) => a.name === 'audit_trade_proposal')!;

      const report = (await auditAction.handler(null, {
        targetMint: testMint,
        expectedOutput: 500,
        maxSlippageBps: 50,
        transactionBase64: wireTx,
      })) as AdversarialAuditReport;

      expect(report.decision).toBe('APPROVED');
      expect(report.breakdown.simulation).not.toBeNull();
      expect(report.breakdown.simulation?.simulatedSuccess).toBe(true);
    });

    test('T3.8: Strict Simulation Requirement Mode: evaluates requirement without wire payload', async () => {
      mockCleanMint(testMint);
      const strictPlugin = new SolInquisitorPlugin({
        connection: mockConn,
        strictSimulationRequired: true,
      });

      const report = await strictPlugin.auditTradeProposal({
        targetMint: testMint,
        expectedOutput: 1000,
        maxSlippageBps: 100,
      });

      // In strictSimulationRequired mode, simulation is always run
      expect(report.breakdown.simulation).not.toBeNull();
      expect(report.decision).toBe('APPROVED');
    });
  });

  // ==========================================================================
  // TIER 4: REAL-WORLD APPLICATION SCENARIOS (Autonomous Agent Trading Flows)
  // ==========================================================================
  describe('Tier 4: Real-World Application Scenarios', () => {
    test('T4.1: Scenario 1 - Autonomous Agent DEX Swap Happy Path', async () => {
      // Setup clean utility token
      mockCleanMint(testMint);
      const wireTx = createMockWireTx();

      const conn = createMockConnection({
        largestAccounts: [
          { address: Keypair.generate().publicKey, amount: '50000', uiAmount: 50 }, // 5%
        ],
        simulateUnits: 19500,
        simulateLogs: ['Instruction: SwapSuccess', 'Program return: ok'],
      });
      const agentInquisitor = new SolInquisitorPlugin({ connection: conn });

      // Autonomous agent pre-flight audit
      const auditReport = await agentInquisitor.auditTradeProposal({
        targetMint: testMint,
        expectedOutput: 10000,
        maxSlippageBps: 50, // 0.5%
        transactionBase64: wireTx,
        walletPublicKey: Keypair.generate().publicKey.toBase58(),
      });

      expect(auditReport.decision).toBe('APPROVED');
      expect(auditReport.verdict).toContain('PASSED');
      expect(auditReport.overallRiskScore).toBeLessThan(40);
      expect(auditReport.vetoReasons).toHaveLength(0);
      expect(auditReport.breakdown.rugProbe.isUnsafe).toBe(false);
      expect(auditReport.breakdown.mevGuard.sandwichVulnerability).toBe(false);
      expect(auditReport.breakdown.simulation?.simulatedSuccess).toBe(true);
    });

    test('T4.2: Scenario 2 - Malicious Meme Honeypot Evasion (Unrevoked Freeze Authority)', async () => {
      // Creator leaves freeze authority active to freeze seller balances
      const creatorKey = Keypair.generate().publicKey;
      (splToken.getMint as jest.Mock).mockResolvedValue({
        address: new PublicKey(testMint),
        mintAuthority: null,
        freezeAuthority: creatorKey,
        supply: BigInt(1000000000),
        decimals: 9,
        isInitialized: true,
      });

      const auditReport = await plugin.auditTradeProposal({
        targetMint: testMint,
        expectedOutput: 500000,
        maxSlippageBps: 100,
      });

      expect(auditReport.decision).toBe('BLOCKED');
      expect(auditReport.breakdown.rugProbe.hasFreezeAuthority).toBe(true);
      expect(auditReport.breakdown.rugProbe.freezeAuthority).toBe(creatorKey.toBase58());
      expect(auditReport.recommendations).toContain(
        'Refuse trading: Honeypot hazard due to unrevoked freeze authority.'
      );
    });

    test('T4.3: Scenario 3 - Whale Dumping Defense (Supply Concentration)', async () => {
      // Top 5 accounts control 88% of circulating supply
      const mockMintAuth = Keypair.generate().publicKey;
      (splToken.getMint as jest.Mock).mockResolvedValue({
        address: new PublicKey(testMint),
        mintAuthority: mockMintAuth, // +35
        freezeAuthority: null,
        supply: BigInt(100000),
        decimals: 6,
        isInitialized: true,
      });

      const whaleConn = createMockConnection({
        largestAccounts: [
          { address: Keypair.generate().publicKey, amount: '45000' },
          { address: Keypair.generate().publicKey, amount: '25000' },
          { address: Keypair.generate().publicKey, amount: '18000' }, // 45 + 25 + 18 = 88% (+30)
        ],
      });
      const whalePlugin = new SolInquisitorPlugin({ connection: whaleConn });

      const auditReport = await whalePlugin.auditTradeProposal({
        targetMint: testMint,
        expectedOutput: 2000,
        maxSlippageBps: 100,
      });

      expect(auditReport.decision).toBe('BLOCKED');
      expect(auditReport.breakdown.rugProbe.topHoldersSharePercentage).toBe(88);
      expect(auditReport.breakdown.rugProbe.concentrationRiskScore).toBe(30);
      expect(auditReport.breakdown.rugProbe.totalRiskScore).toBe(65); // 35 + 30
      expect(auditReport.recommendations.some((r) => r.includes('Monitor whale wallets'))).toBe(true);
    });

    test('T4.4: Scenario 4 - Jito MEV Sandwich Attack Defense (Volatile Slippage Spike)', async () => {
      mockCleanMint(testMint);

      // Agent dynamic router inflated slippage to 600 bps during volatility
      const auditReport = await plugin.auditTradeProposal({
        targetMint: testMint,
        expectedOutput: 1000,
        maxSlippageBps: 600,
      });

      expect(auditReport.decision).toBe('BLOCKED');
      expect(auditReport.breakdown.mevGuard.riskLevel).toBe('CRITICAL');
      expect(auditReport.breakdown.mevGuard.sandwichVulnerability).toBe(true);
      expect(auditReport.recommendations.some((r) => r.includes('Reduce slippage tolerance to maximum 100 bps'))).toBe(true);
    });

    test('T4.5: Scenario 5 - Hidden Transfer Tax / Token-2022 Fee Evasion', async () => {
      // Token charges unadvertised 10% fee on swap
      const simReport = await simulateAndVerifyProposal({
        connection: mockConn,
        targetMint: testMint,
        expectedOutput: 1000,
        maxSlippageBps: 100, // 1% allowed => minAcceptable 990
        mockOverride: {
          err: null,
          logs: ['Instruction: TransferWithFee', 'Program Fee deducted: 10%'],
          unitsConsumed: 28000,
          preBalance: 0,
          postBalance: 900, // 10% loss => 900 < 990
        },
      });

      expect(simReport.slippageExceeded).toBe(true);
      expect(simReport.vetoed).toBe(true);
      expect(simReport.actualOutputDelta).toBe(900);
      expect(simReport.reasons.some((r) => r.includes('Pre-flight balance delta violation'))).toBe(true);
    });

    test('T4.6: Scenario 6 - Multi-Agent MCP Autonomous Trading Orchestration', async () => {
      // AI planner agent interacts via MCP transport
      const creatorKey = Keypair.generate().publicKey;
      (splToken.getMint as jest.Mock).mockResolvedValue({
        address: new PublicKey(testMint),
        mintAuthority: null,
        freezeAuthority: creatorKey, // Honeypot!
        supply: BigInt(1000000),
        decimals: 6,
        isInitialized: true,
      });

      const server = await startMcpServer(plugin);
      const [cTrans, sTrans] = InMemoryTransport.createLinkedPair();
      const plannerClient = new Client({ name: 'ai-planner-agent', version: '2.0.0' }, { capabilities: {} });

      await Promise.all([server.connect(sTrans), plannerClient.connect(cTrans)]);

      // Planner executes pre-flight security probe
      const mcpResponse = (await plannerClient.callTool({
        name: 'audit_solana_trade',
        arguments: {
          targetMint: testMint,
          expectedOutput: 5000,
          maxSlippageBps: 100,
        },
      })) as any;

      expect(mcpResponse.content).toBeDefined();
      const parsedAudit = JSON.parse(mcpResponse.content[0].text);

      // Autonomous planner asserts security decision and aborts execution
      expect(parsedAudit.decision).toBe('BLOCKED');
      expect(parsedAudit.overallRiskScore).toBeGreaterThanOrEqual(45);
      expect(parsedAudit.vetoReasons.length).toBeGreaterThan(0);

      await plannerClient.close();
    });
  });
});
