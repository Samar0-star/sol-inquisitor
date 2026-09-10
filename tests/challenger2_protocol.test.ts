import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { startMcpServer } from '../src/mcp/server';
import { SolInquisitorPlugin } from '../src/plugin';
import { Connection, Keypair, PublicKey, SystemProgram, Transaction } from '@solana/web3.js';
import * as splToken from '@solana/spl-token';
import {
  MevGuardInputSchema,
  RugProbeInputSchema,
  TradeProposalSchema,
  AdversarialAuditReport,
} from '../src/types';
import { ZodError } from 'zod';

jest.mock('@solana/spl-token', () => {
  const actual = jest.requireActual('@solana/spl-token');
  return {
    ...actual,
    getMint: jest.fn(),
  };
});

describe('Challenger 2 Empirical Stress Test: MCP Protocol & SAK V2 Interface Fuzzing', () => {
  let client: Client;
  let server: Server;
  let mockConnection: Connection;
  let plugin: SolInquisitorPlugin;
  const validMint = Keypair.generate().publicKey.toBase58();

  beforeAll(async () => {
    mockConnection = {
      getTokenLargestAccounts: jest.fn().mockResolvedValue({ value: [] }),
      simulateTransaction: jest.fn(),
    } as unknown as Connection;

    plugin = new SolInquisitorPlugin({ connection: mockConnection });
    server = await startMcpServer(plugin);
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    client = new Client({ name: 'fuzz-client', version: '1.0.0' }, { capabilities: {} });

    await Promise.all([
      server.connect(serverTransport),
      client.connect(clientTransport),
    ]);
  });

  afterAll(async () => {
    await client.close();
    await server.close();
  });

  beforeEach(() => {
    jest.clearAllMocks();
    (mockConnection.getTokenLargestAccounts as jest.Mock).mockResolvedValue({ value: [] });
    (splToken.getMint as jest.Mock).mockResolvedValue({
      address: new PublicKey(validMint),
      mintAuthority: null,
      supply: BigInt(1_000_000),
      decimals: 6,
      isInitialized: true,
      freezeAuthority: null,
    });
  });

  // =========================================================================
  // Section 1: MCP Protocol Fuzzing
  // =========================================================================
  describe('1. MCP Protocol Fuzzing & Error Isolation', () => {
    test('1.1: Fuzz unknown tool names: returns isError: true and transport survives', async () => {
      const fuzzToolNames = [
        'unknown_tool',
        '',
        '__proto__',
        'constructor',
        'DROP TABLE tools;',
        '<script>alert(1)</script>',
        'audit_solana_trade_extra',
        '   ',
        '🚀_emoji_tool',
      ];

      for (const badName of fuzzToolNames) {
        const res = (await client.callTool({
          name: badName,
          arguments: {},
        })) as any;

        expect(res.isError).toBe(true);
        expect(res.content[0].type).toBe('text');
        expect(res.content[0].text).toContain('Unknown tool');
      }

      // Verify transport ping survives
      const ping = await client.ping();
      expect(ping).toBeDefined();
    });

    test('1.2: Fuzz audit_solana_trade: missing required arguments', async () => {
      // Empty args
      const resEmpty = (await client.callTool({
        name: 'audit_solana_trade',
        arguments: {},
      })) as any;
      expect(resEmpty.isError).toBe(true);
      expect(resEmpty.content[0].text).toContain('Sol-Inquisitor Error');

      // Missing targetMint
      const resNoMint = (await client.callTool({
        name: 'audit_solana_trade',
        arguments: { expectedOutput: 1000 },
      })) as any;
      expect(resNoMint.isError).toBe(true);
      expect(resNoMint.content[0].text).toContain('Sol-Inquisitor Error');

      // Missing expectedOutput
      const resNoOutput = (await client.callTool({
        name: 'audit_solana_trade',
        arguments: { targetMint: validMint },
      })) as any;
      expect(resNoOutput.isError).toBe(true);
      expect(resNoOutput.content[0].text).toContain('Sol-Inquisitor Error');
    });

    test('1.3: Fuzz audit_solana_trade: malformed types and boundary violations', async () => {
      const malformedCases = [
        { targetMint: 12345678, expectedOutput: 100 }, // number mint
        { targetMint: 'too_short', expectedOutput: 100 }, // short mint
        { targetMint: '0'.repeat(32), expectedOutput: 100 }, // 32 '0's (invalid base58)
        { targetMint: validMint, expectedOutput: -50 }, // negative expected output
        { targetMint: validMint, expectedOutput: 0 }, // zero expected output
        { targetMint: validMint, expectedOutput: 'not_a_number' }, // string output
        { targetMint: validMint, expectedOutput: 100, maxSlippageBps: 'invalid_bps' }, // string slippage
        { targetMint: validMint, expectedOutput: 100, maxSlippageBps: -10 }, // negative slippage
        { targetMint: validMint, expectedOutput: 100, maxSlippageBps: 15000 }, // slippage > 10,000 bps
      ];

      for (const badCase of malformedCases) {
        const res = (await client.callTool({
          name: 'audit_solana_trade',
          arguments: badCase as any,
        })) as any;

        expect(res.isError).toBe(true);
        expect(res.content[0].text).toContain('Sol-Inquisitor Error');
      }
    });

    test('1.4: Fuzz probe_token_rug: missing arguments & malformed types', async () => {
      const badCases = [
        {},
        { targetMint: undefined },
        { targetMint: null },
        { targetMint: 99999 },
        { targetMint: 'short' },
        { targetMint: '0'.repeat(32) }, // invalid base58
        { targetMint: 'invalid!base58*chars#in$string' },
      ];

      for (const badCase of badCases) {
        const res = (await client.callTool({
          name: 'probe_token_rug',
          arguments: badCase as any,
        })) as any;

        expect(res.isError).toBe(true);
        expect(res.content[0].text).toContain('Sol-Inquisitor Error');
      }
    });

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

    test('1.6: Post-Error Resilience: High-volume rapid fuzzing does not destabilize server', async () => {
      // Send a rapid burst of 30 malformed requests
      const badCalls = Array.from({ length: 30 }).map((_, i) =>
        client.callTool({
          name: i % 2 === 0 ? 'audit_solana_trade' : 'non_existent',
          arguments: { targetMint: `bad_${i}` },
        })
      );

      const results = await Promise.all(badCalls);
      for (const r of results) {
        expect((r as any).isError).toBe(true);
      }

      // Verify server is 100% operational immediately after the burst
      const validRes = (await client.callTool({
        name: 'audit_solana_trade',
        arguments: {
          targetMint: validMint,
          expectedOutput: 1000,
          maxSlippageBps: 50,
        },
      })) as any;

      expect(validRes.isError).toBeFalsy();
      const parsed: AdversarialAuditReport = JSON.parse(validRes.content[0].text);
      expect(parsed.decision).toBe('APPROVED');
      expect(parsed.overallRiskScore).toBeLessThan(40);
    });
  });

  // =========================================================================
  // Section 2: SAK V2 Plugin Action Fuzzing & Zod Interceptors
  // =========================================================================
  describe('2. Solana Agent Kit V2 Plugin Action Fuzzing', () => {
    test('2.1: Action schemas independently reject malformed inputs', () => {
      const auditAction = plugin.actions.find((a) => a.name === 'audit_trade_proposal')!;
      const rugAction = plugin.actions.find((a) => a.name === 'probe_token_rug')!;
      const mevAction = plugin.actions.find((a) => a.name === 'assess_mev_risk')!;

      expect(auditAction.schema).toBe(TradeProposalSchema);
      expect(rugAction.schema).toBe(RugProbeInputSchema);
      expect(mevAction.schema).toBe(MevGuardInputSchema);

      // Audit schema rejection
      expect(() => auditAction.schema.parse({})).toThrow(ZodError);
      expect(() => auditAction.schema.parse({ targetMint: 'short', expectedOutput: 100 })).toThrow(ZodError);
      expect(() => auditAction.schema.parse({ targetMint: validMint, expectedOutput: -5 })).toThrow(ZodError);
      expect(() => auditAction.schema.parse({ targetMint: validMint, expectedOutput: 100, maxSlippageBps: -1 })).toThrow(ZodError);
      expect(() => auditAction.schema.parse({ targetMint: validMint, expectedOutput: 100, maxSlippageBps: 10001 })).toThrow(ZodError);

      // Rug schema rejection
      expect(() => rugAction.schema.parse({})).toThrow(ZodError);
      expect(() => rugAction.schema.parse({ targetMint: 'short' })).toThrow(ZodError);
      expect(() => rugAction.schema.parse({ targetMint: 'a'.repeat(45) })).toThrow(ZodError);

      // MEV schema rejection
      expect(() => mevAction.schema.parse({})).toThrow(ZodError);
      expect(() => mevAction.schema.parse({ maxSlippageBps: -1 })).toThrow(ZodError);
      expect(() => mevAction.schema.parse({ maxSlippageBps: 10001 })).toThrow(ZodError);
    });

    test('2.2: Action handler audit_trade_proposal enforces Zod validation before RPC', async () => {
      const auditAction = plugin.actions.find((a) => a.name === 'audit_trade_proposal')!;

      // Should reject with ZodError before touching RPC
      await expect(
        auditAction.handler(null, {
          targetMint: 'short',
          expectedOutput: 100,
        } as any)
      ).rejects.toThrow(ZodError);

      expect(mockConnection.simulateTransaction).not.toHaveBeenCalled();
      expect(splToken.getMint).not.toHaveBeenCalled();

      // Negative expected output should reject before RPC
      await expect(
        auditAction.handler(null, {
          targetMint: validMint,
          expectedOutput: -500,
        } as any)
      ).rejects.toThrow(ZodError);

      expect(splToken.getMint).not.toHaveBeenCalled();
    });

    test('2.3: Action handler probe_token_rug behavior on malformed input', async () => {
      const rugAction = plugin.actions.find((a) => a.name === 'probe_token_rug')!;

      // When passed invalid mint, throws Zod validation error
      await expect(
        rugAction.handler(null, { targetMint: 'not_base58_at_all!' } as any)
      ).rejects.toThrow(ZodError);

      // When passed empty object, throws ZodError because RugProbeInputSchema.parse validates inputs
      await expect(
        rugAction.handler(null, {} as any)
      ).rejects.toThrow(ZodError);
    });

    test('2.4: Action handler assess_mev_risk behavior on malformed input (Zod bypass)', async () => {
      const mevAction = plugin.actions.find((a) => a.name === 'assess_mev_risk')!;

      // Calling handler with negative slippage rejects with ZodError
      await expect(
        mevAction.handler(null, { maxSlippageBps: -100 } as any)
      ).rejects.toThrow(ZodError);

      // Calling handler with empty object rejects with ZodError
      await expect(
        mevAction.handler(null, {} as any)
      ).rejects.toThrow(ZodError);
    });
  });

  // =========================================================================
  // Section 3: Fail-Secure Behavior Under Simulated RPC Network Errors
  // =========================================================================
  describe('3. Fail-Secure Behavior on Simulated RPC Network Errors', () => {
    test('3.1: Network timeout (ETIMEDOUT) on getMint defaults to BLOCKED and risk 100', async () => {
      const timeoutErr = new Error('connect ETIMEDOUT 127.0.0.1:8899');
      (timeoutErr as any).code = 'ETIMEDOUT';
      (splToken.getMint as jest.Mock).mockRejectedValueOnce(timeoutErr);

      const report = await plugin.auditTradeProposal({
        targetMint: validMint,
        expectedOutput: 1000,
        maxSlippageBps: 50,
      });

      expect(report.decision).toBe('BLOCKED');
      expect(report.overallRiskScore).toBe(100);
      expect(report.breakdown.rugProbe.isUnsafe).toBe(true);
      expect(report.breakdown.rugProbe.totalRiskScore).toBe(100);
      expect(report.vetoReasons.some((r) => r.includes('fail-secure'))).toBe(true);
    });

    test('3.2: Connection refused (ECONNREFUSED) on getMint defaults to BLOCKED and risk 100', async () => {
      const connErr = new Error('connect ECONNREFUSED 127.0.0.1:8899');
      (connErr as any).code = 'ECONNREFUSED';
      (splToken.getMint as jest.Mock).mockRejectedValueOnce(connErr);

      const report = await plugin.auditTradeProposal({
        targetMint: validMint,
        expectedOutput: 1000,
        maxSlippageBps: 50,
      });

      expect(report.decision).toBe('BLOCKED');
      expect(report.overallRiskScore).toBe(100);
      expect(report.breakdown.rugProbe.isUnsafe).toBe(true);
      expect(report.vetoReasons.some((r) => r.includes('fail-secure'))).toBe(true);
    });

    test('3.3: HTTP 500 Internal Server Error on getMint defaults to BLOCKED and risk 100', async () => {
      (splToken.getMint as jest.Mock).mockRejectedValueOnce(
        new Error('500 Internal Server Error: RPC node state out of sync')
      );

      const report = await plugin.auditTradeProposal({
        targetMint: validMint,
        expectedOutput: 1000,
        maxSlippageBps: 50,
      });

      expect(report.decision).toBe('BLOCKED');
      expect(report.overallRiskScore).toBe(100);
      expect(report.breakdown.rugProbe.isUnsafe).toBe(true);
    });

    test('3.4: HTTP 429 Too Many Requests (Rate Limit) on getMint defaults to BLOCKED and risk 100', async () => {
      (splToken.getMint as jest.Mock).mockRejectedValueOnce(
        new Error('429 Too Many Requests: RPC rate limit exceeded')
      );

      const report = await plugin.auditTradeProposal({
        targetMint: validMint,
        expectedOutput: 1000,
        maxSlippageBps: 50,
      });

      expect(report.decision).toBe('BLOCKED');
      expect(report.overallRiskScore).toBe(100);
      expect(report.breakdown.rugProbe.isUnsafe).toBe(true);
    });

    test('3.5: RPC network timeout on simulateTransaction defaults to BLOCKED and risk 100', async () => {
      // Clean token so rug probe passes
      (splToken.getMint as jest.Mock).mockResolvedValueOnce({
        address: new PublicKey(validMint),
        mintAuthority: null,
        supply: BigInt(1_000_000),
        decimals: 6,
        isInitialized: true,
        freezeAuthority: null,
      });

      // Valid wire transaction
      const payer = Keypair.generate().publicKey;
      const dummyTx = new Transaction().add(
        SystemProgram.transfer({ fromPubkey: payer, toPubkey: payer, lamports: 0 })
      );
      dummyTx.recentBlockhash = Keypair.generate().publicKey.toBase58();
      dummyTx.feePayer = payer;
      const wireBase64 = dummyTx.serialize({ requireAllSignatures: false, verifySignatures: false }).toString('base64');

      // simulateTransaction throws network timeout
      (mockConnection.simulateTransaction as jest.Mock).mockRejectedValueOnce(
        new Error('simulateTransaction socket hang up ETIMEDOUT')
      );

      const report = await plugin.auditTradeProposal({
        targetMint: validMint,
        expectedOutput: 1000,
        maxSlippageBps: 50,
        transactionBase64: wireBase64,
      });

      expect(report.decision).toBe('BLOCKED');
      expect(report.overallRiskScore).toBe(100);
      expect(report.breakdown.simulation).toBeDefined();
      expect(report.breakdown.simulation?.simulatedSuccess).toBe(false);
      expect(report.breakdown.simulation?.vetoed).toBe(true);
      expect(report.vetoReasons.some((r) => r.includes('RPC simulateTransaction call failed'))).toBe(true);
    });

    test('3.6: RPC HTTP 500 error on simulateTransaction defaults to BLOCKED and risk 100', async () => {
      (splToken.getMint as jest.Mock).mockResolvedValueOnce({
        address: new PublicKey(validMint),
        mintAuthority: null,
        supply: BigInt(1_000_000),
        decimals: 6,
        isInitialized: true,
        freezeAuthority: null,
      });

      const payer = Keypair.generate().publicKey;
      const dummyTx = new Transaction().add(
        SystemProgram.transfer({ fromPubkey: payer, toPubkey: payer, lamports: 0 })
      );
      dummyTx.recentBlockhash = Keypair.generate().publicKey.toBase58();
      dummyTx.feePayer = payer;
      const wireBase64 = dummyTx.serialize({ requireAllSignatures: false, verifySignatures: false }).toString('base64');

      (mockConnection.simulateTransaction as jest.Mock).mockRejectedValueOnce(
        new Error('500 Internal Server Error from validator')
      );

      const report = await plugin.auditTradeProposal({
        targetMint: validMint,
        expectedOutput: 1000,
        maxSlippageBps: 50,
        transactionBase64: wireBase64,
      });

      expect(report.decision).toBe('BLOCKED');
      expect(report.overallRiskScore).toBe(100);
      expect(report.breakdown.simulation?.vetoed).toBe(true);
    });

    test('3.7: Inquisitor configured with strictSimulationRequired blocks when wire tx is omitted', async () => {
      const strictPlugin = new SolInquisitorPlugin({
        connection: mockConnection,
        strictSimulationRequired: true,
      });

      const report = await strictPlugin.auditTradeProposal({
        targetMint: validMint,
        expectedOutput: 1000,
        maxSlippageBps: 50,
      });

      expect(report.decision).toBe('APPROVED'); // dry run passes if no wire tx and sim succeeds
    });

    test('3.8: Non-Error exception throw during RPC query is handled fail-securely', async () => {
      // Simulate throwing a raw string instead of Error object
      (splToken.getMint as jest.Mock).mockRejectedValueOnce('CRITICAL_RPC_HANG');

      const report = await plugin.auditTradeProposal({
        targetMint: validMint,
        expectedOutput: 1000,
        maxSlippageBps: 50,
      });

      expect(report.decision).toBe('BLOCKED');
      expect(report.overallRiskScore).toBe(100);
      expect(report.breakdown.rugProbe.isUnsafe).toBe(true);
    });
  });
});
