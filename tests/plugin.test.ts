import { Connection, PublicKey, Keypair } from '@solana/web3.js';
import * as splToken from '@solana/spl-token';
import { SolInquisitorPlugin } from '../src/plugin';
import { assessMevRisk } from '../src/modules/mevGuard';

jest.mock('@solana/spl-token', () => {
  const actual = jest.requireActual('@solana/spl-token');
  return {
    ...actual,
    getMint: jest.fn(),
  };
});

describe('SolInquisitorPlugin End-to-End Integration', () => {
  let mockConnection: Connection;
  let plugin: SolInquisitorPlugin;
  const dummyMint = Keypair.generate().publicKey.toBase58();

  beforeEach(() => {
    jest.clearAllMocks();
    mockConnection = {
      getTokenLargestAccounts: jest.fn().mockResolvedValue({
        value: [
          {
            address: Keypair.generate().publicKey,
            amount: '1000',
            decimals: 6,
            uiAmount: 1,
            uiAmountString: '1',
          },
        ],
      }),
      simulateTransaction: jest.fn(),
    } as unknown as Connection;

    plugin = new SolInquisitorPlugin({ connection: mockConnection });
  });

  test('E2E: Blocks honeypot trade proposal when freezeAuthority is active', async () => {
    const mockFreezeAuth = Keypair.generate().publicKey;
    (splToken.getMint as jest.Mock).mockResolvedValue({
      address: new PublicKey(dummyMint),
      mintAuthority: null,
      supply: BigInt(100000),
      decimals: 6,
      isInitialized: true,
      freezeAuthority: mockFreezeAuth,
    });

    const report = await plugin.auditTradeProposal({
      targetMint: dummyMint,
      expectedOutput: 5000,
      maxSlippageBps: 100,
    });

    expect(report.decision).toBe('BLOCKED');
    expect(report.verdict).toContain('VETO: Transaction proposal rejected');
    expect(report.overallRiskScore).toBeGreaterThanOrEqual(45);
    expect(report.breakdown.rugProbe.hasFreezeAuthority).toBe(true);
    expect(report.vetoReasons.length).toBeGreaterThan(0);
    expect(report.recommendations.some((r) => r.includes('Refuse trading: Honeypot hazard'))).toBe(true);
  });

  test('E2E: Blocks trade proposal with critical MEV sandwich slippage (>500 bps)', async () => {
    (splToken.getMint as jest.Mock).mockResolvedValue({
      address: new PublicKey(dummyMint),
      mintAuthority: null,
      supply: BigInt(100000),
      decimals: 6,
      isInitialized: true,
      freezeAuthority: null,
    });

    const report = await plugin.auditTradeProposal({
      targetMint: dummyMint,
      expectedOutput: 5000,
      maxSlippageBps: 600, // 6% slippage
    });

    expect(report.decision).toBe('BLOCKED');
    expect(report.breakdown.mevGuard.riskLevel).toBe('CRITICAL');
    expect(report.breakdown.mevGuard.sandwichVulnerability).toBe(true);
    expect(report.vetoReasons.some((r) => r.includes('MEV Guard flagged high sandwich risk'))).toBe(true);
  });

  test('E2E: Approves clean, decentralized trade proposal with low slippage', async () => {
    (splToken.getMint as jest.Mock).mockResolvedValue({
      address: new PublicKey(dummyMint),
      mintAuthority: null,
      supply: BigInt(1000000),
      decimals: 6,
      isInitialized: true,
      freezeAuthority: null,
    });

    const report = await plugin.auditTradeProposal({
      targetMint: dummyMint,
      expectedOutput: 10000,
      maxSlippageBps: 50, // 0.5% slippage
    });

    expect(report.decision).toBe('APPROVED');
    expect(report.verdict).toContain('PASSED: Transaction proposal cleared');
    expect(report.overallRiskScore).toBeLessThan(40);
    expect(report.breakdown.rugProbe.isUnsafe).toBe(false);
    expect(report.breakdown.mevGuard.sandwichVulnerability).toBe(false);
    expect(report.vetoReasons).toHaveLength(0);
  });

  test('Plugin Action Handlers: verifies Solana Agent Kit action integration', async () => {
    expect(plugin.actions.length).toBe(3);
    const actionNames = plugin.actions.map((a) => a.name);
    expect(actionNames).toContain('audit_trade_proposal');
    expect(actionNames).toContain('probe_token_rug');
    expect(actionNames).toContain('assess_mev_risk');

    (splToken.getMint as jest.Mock).mockResolvedValue({
      address: new PublicKey(dummyMint),
      mintAuthority: null,
      supply: BigInt(50000),
      decimals: 6,
      isInitialized: true,
      freezeAuthority: null,
    });

    const probeAction = plugin.actions.find((a) => a.name === 'probe_token_rug')!;
    const rugResult = (await probeAction.handler(null, { targetMint: dummyMint })) as any;
    expect(rugResult.mint).toBe(dummyMint);
    expect(rugResult.isUnsafe).toBe(false);

    const mevAction = plugin.actions.find((a) => a.name === 'assess_mev_risk')!;
    const mevResult = (await mevAction.handler(null, { maxSlippageBps: 400 })) as any;
    expect(mevResult.riskLevel).toBe('HIGH');
    expect(mevResult.sandwichVulnerability).toBe(true);
  });

  test('mevGuard Module: correctly stratifies slippage tiers', () => {
    expect(assessMevRisk({ maxSlippageBps: 20 }).riskLevel).toBe('LOW');
    expect(assessMevRisk({ maxSlippageBps: 100 }).riskLevel).toBe('LOW');
    expect(assessMevRisk({ maxSlippageBps: 200 }).riskLevel).toBe('MEDIUM');
    expect(assessMevRisk({ maxSlippageBps: 400 }).riskLevel).toBe('HIGH');
    expect(assessMevRisk({ maxSlippageBps: 700 }).riskLevel).toBe('CRITICAL');
  });
});
