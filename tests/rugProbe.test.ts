import { Connection, PublicKey, Keypair } from '@solana/web3.js';
import * as splToken from '@solana/spl-token';
import { probeRugRisks } from '../src/modules/rugProbe';

jest.mock('@solana/spl-token', () => {
  const actual = jest.requireActual('@solana/spl-token');
  return {
    ...actual,
    getMint: jest.fn(),
  };
});

describe('rugProbe Module', () => {
  let mockConnection: Connection;
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
    } as unknown as Connection;
  });

  test('flags honeypot with active freezeAuthority (+45 risk) and rejects trade', async () => {
    const mockFreezeAuthority = Keypair.generate().publicKey;
    (splToken.getMint as jest.Mock).mockResolvedValue({
      address: new PublicKey(dummyMint),
      mintAuthority: null,
      supply: BigInt(10000),
      decimals: 6,
      isInitialized: true,
      freezeAuthority: mockFreezeAuthority,
    });

    const report = await probeRugRisks(mockConnection, dummyMint);

    expect(report.hasFreezeAuthority).toBe(true);
    expect(report.freezeAuthority).toBe(mockFreezeAuthority.toBase58());
    expect(report.freezeRiskScore).toBe(45);
    expect(report.isUnsafe).toBe(true);
    expect(report.totalRiskScore).toBeGreaterThanOrEqual(45);
    expect(report.reasons.some((r) => r.includes('Freeze Authority detected'))).toBe(true);
  });

  test('detects active mintAuthority (+35 risk)', async () => {
    const mockMintAuthority = Keypair.generate().publicKey;
    (splToken.getMint as jest.Mock).mockResolvedValue({
      address: new PublicKey(dummyMint),
      mintAuthority: mockMintAuthority,
      supply: BigInt(10000),
      decimals: 6,
      isInitialized: true,
      freezeAuthority: null,
    });

    const report = await probeRugRisks(mockConnection, dummyMint);

    expect(report.hasMintAuthority).toBe(true);
    expect(report.mintAuthority).toBe(mockMintAuthority.toBase58());
    expect(report.mintRiskScore).toBe(35);
    expect(report.hasFreezeAuthority).toBe(false);
    expect(report.reasons.some((r) => r.includes('Mint Authority detected'))).toBe(true);
  });

  test('flags severe honeypot with BOTH freeze (+45) and mint (+35) authorities', async () => {
    const mockAuthority = Keypair.generate().publicKey;
    (splToken.getMint as jest.Mock).mockResolvedValue({
      address: new PublicKey(dummyMint),
      mintAuthority: mockAuthority,
      supply: BigInt(1000000),
      decimals: 6,
      isInitialized: true,
      freezeAuthority: mockAuthority,
    });

    const report = await probeRugRisks(mockConnection, dummyMint);

    expect(report.hasFreezeAuthority).toBe(true);
    expect(report.hasMintAuthority).toBe(true);
    expect(report.freezeRiskScore).toBe(45);
    expect(report.mintRiskScore).toBe(35);
    expect(report.totalRiskScore).toBeGreaterThanOrEqual(80);
    expect(report.isUnsafe).toBe(true);
  });

  test('flags whale concentration risk if top holders own > 80% of circulating supply', async () => {
    (splToken.getMint as jest.Mock).mockResolvedValue({
      address: new PublicKey(dummyMint),
      mintAuthority: null,
      supply: BigInt(10000),
      decimals: 6,
      isInitialized: true,
      freezeAuthority: null,
    });

    const whalePubkey = Keypair.generate().publicKey;
    (mockConnection.getTokenLargestAccounts as jest.Mock).mockResolvedValue({
      value: [
        {
          address: whalePubkey,
          amount: '8500', // 85% of 10000
          decimals: 6,
          uiAmount: 8.5,
          uiAmountString: '8.5',
        },
      ],
    });

    const report = await probeRugRisks(mockConnection, dummyMint);

    expect(report.concentrationRiskScore).toBe(30);
    expect(report.topHoldersSharePercentage).toBe(85);
    expect(report.reasons.some((r) => r.includes('whale concentration'))).toBe(true);
  });

  test('approves a clean decentralized token (revoked freeze & mint authorities, distributed holders)', async () => {
    (splToken.getMint as jest.Mock).mockResolvedValue({
      address: new PublicKey(dummyMint),
      mintAuthority: null,
      supply: BigInt(1000000),
      decimals: 6,
      isInitialized: true,
      freezeAuthority: null,
    });

    const poolPubkey = Keypair.generate().publicKey;
    (mockConnection.getTokenLargestAccounts as jest.Mock).mockResolvedValue({
      value: [
        {
          address: poolPubkey,
          amount: '50000', // 5%
          decimals: 6,
          uiAmount: 50,
          uiAmountString: '50',
        },
      ],
    });

    const report = await probeRugRisks(mockConnection, dummyMint);

    expect(report.hasFreezeAuthority).toBe(false);
    expect(report.hasMintAuthority).toBe(false);
    expect(report.totalRiskScore).toBe(0);
    expect(report.isUnsafe).toBe(false);
  });

  test('handles on-chain query failure with fail-secure unsafe verdict', async () => {
    (splToken.getMint as jest.Mock).mockRejectedValue(new Error('RPC node timed out'));

    const report = await probeRugRisks(mockConnection, dummyMint);

    expect(report.isUnsafe).toBe(true);
    expect(report.totalRiskScore).toBe(100);
    expect(report.reasons.some((r) => r.includes('fail-secure protocol'))).toBe(true);
  });
});
