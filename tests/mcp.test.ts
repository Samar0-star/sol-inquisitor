import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { startMcpServer } from '../src/mcp/server';
import { SolInquisitorPlugin } from '../src/plugin';
import { Connection, Keypair, PublicKey, SystemProgram, Transaction } from '@solana/web3.js';
import * as splToken from '@solana/spl-token';
import { AdversarialAuditReport, MevRiskReport, RugRiskReport } from '../src/types';

jest.mock('@solana/spl-token', () => {
  const actual = jest.requireActual('@solana/spl-token');
  return {
    ...actual,
    getMint: jest.fn(),
  };
});

describe('MCP Server Integration & Pre-Flight Tool Execution', () => {
  let client: Client;
  let server: Server;
  let mockConnection: Connection;
  let testPlugin: SolInquisitorPlugin;
  const dummyMint = Keypair.generate().publicKey.toBase58();

  beforeAll(async () => {
    mockConnection = {
      getTokenLargestAccounts: jest.fn().mockResolvedValue({
        value: [],
      }),
      simulateTransaction: jest.fn(),
    } as unknown as Connection;

    testPlugin = new SolInquisitorPlugin({ connection: mockConnection });
    server = await startMcpServer(testPlugin);
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();

    client = new Client({ name: 'test-mcp-client', version: '1.0.0' }, { capabilities: {} });

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
    (mockConnection.getTokenLargestAccounts as jest.Mock).mockResolvedValue({
      value: [],
    });
  });

  // =========================================================================
  // 1. Server Initialization
  // =========================================================================
  describe('1. Server Initialization', () => {
    test('starts cleanly with custom SolInquisitorPlugin instance', async () => {
      const customServer = await startMcpServer(testPlugin);
      expect(customServer).toBeDefined();
      expect(customServer).toBeInstanceOf(Server);
    });

    test('starts cleanly with default configuration and options', async () => {
      const defaultServer = await startMcpServer();
      expect(defaultServer).toBeDefined();
      expect(defaultServer).toBeInstanceOf(Server);
    });

    test('maintains active in-memory transport without external network dependency', async () => {
      const pingResult = await client.ping();
      expect(pingResult).toBeDefined();
    });
  });

  // =========================================================================
  // 2. Tool Listing
  // =========================================================================
  describe('2. Tool Listing', () => {
    test('satisfies acceptance criterion: MCP stdio server initializes properly and responds to tool listing', async () => {
      const toolsResult = await client.listTools();
      expect(toolsResult).toBeDefined();
      expect(toolsResult.tools).toHaveLength(3);

      const toolNames = toolsResult.tools.map((t) => t.name);
      expect(toolNames).toContain('audit_solana_trade');
      expect(toolNames).toContain('probe_token_rug');
      expect(toolNames).toContain('assess_mev_risk');
    });

    test('verifies audit_solana_trade schema defines required inputs and parameter specifications', async () => {
      const toolsResult = await client.listTools();
      const auditTool = toolsResult.tools.find((t) => t.name === 'audit_solana_trade');

      expect(auditTool).toBeDefined();
      expect(auditTool?.description).toContain('Adversarially falsifies and audits');
      expect(auditTool?.inputSchema.type).toBe('object');
      expect(auditTool?.inputSchema.required).toEqual(['targetMint', 'expectedOutput']);

      const properties = auditTool?.inputSchema.properties as Record<string, unknown>;
      expect(properties).toHaveProperty('targetMint');
      expect(properties).toHaveProperty('expectedOutput');
      expect(properties).toHaveProperty('maxSlippageBps');
      expect(properties).toHaveProperty('walletPublicKey');
      expect(properties).toHaveProperty('transactionBase64');
      expect(properties).toHaveProperty('rpcUrl');
    });

    test('verifies probe_token_rug and assess_mev_risk schemas have valid structures', async () => {
      const toolsResult = await client.listTools();

      const probeTool = toolsResult.tools.find((t) => t.name === 'probe_token_rug');
      expect(probeTool).toBeDefined();
      expect(probeTool?.inputSchema.required).toEqual(['targetMint']);

      const mevTool = toolsResult.tools.find((t) => t.name === 'assess_mev_risk');
      expect(mevTool).toBeDefined();
      expect(mevTool?.inputSchema.required).toEqual(['maxSlippageBps']);
    });
  });

  // =========================================================================
  // 3. Tool Call: audit_solana_trade (Clean Proposal -> APPROVED)
  // =========================================================================
  describe('3. Tool Call: audit_solana_trade (Clean Proposal)', () => {
    test('verifies valid response structure for clean trade proposal (APPROVED, low risk)', async () => {
      (splToken.getMint as jest.Mock).mockResolvedValue({
        address: new PublicKey(dummyMint),
        mintAuthority: null,
        supply: BigInt(1_000_000),
        decimals: 6,
        isInitialized: true,
        freezeAuthority: null,
      });

      (mockConnection.getTokenLargestAccounts as jest.Mock).mockResolvedValue({
        value: [
          {
            address: Keypair.generate().publicKey,
            amount: '50000', // 5% concentration
            decimals: 6,
            uiAmount: 50,
            uiAmountString: '50',
          },
        ],
      });

      const result = (await client.callTool({
        name: 'audit_solana_trade',
        arguments: {
          targetMint: dummyMint,
          expectedOutput: 10000,
          maxSlippageBps: 50, // 0.5% slippage
        },
      })) as any;

      expect(result.isError).toBeFalsy();
      expect(result.content).toBeDefined();
      expect(result.content[0].type).toBe('text');

      const parsed: AdversarialAuditReport = JSON.parse(result.content[0].text);
      expect(parsed.decision).toBe('APPROVED');
      expect(parsed.verdict).toContain('PASSED: Transaction proposal cleared');
      expect(parsed.overallRiskScore).toBeLessThan(40);
      expect(parsed.targetMint).toBe(dummyMint);
      expect(parsed.timestamp).toBeGreaterThan(0);

      // Verify Breakdown Submodules
      expect(parsed.breakdown.rugProbe.isUnsafe).toBe(false);
      expect(parsed.breakdown.rugProbe.hasFreezeAuthority).toBe(false);
      expect(parsed.breakdown.rugProbe.hasMintAuthority).toBe(false);
      expect(parsed.breakdown.rugProbe.totalRiskScore).toBe(0);

      expect(parsed.breakdown.mevGuard.riskLevel).toBe('LOW');
      expect(parsed.breakdown.mevGuard.sandwichVulnerability).toBe(false);
      expect(parsed.breakdown.mevGuard.mevRiskScore).toBeLessThan(50);

      expect(parsed.vetoReasons).toHaveLength(0);
      expect(Array.isArray(parsed.recommendations)).toBe(true);
    });
  });

  // =========================================================================
  // 4. Tool Call: audit_solana_trade (Blocked Responses / Vetoes)
  // =========================================================================
  describe('4. Tool Call: audit_solana_trade (Blocked Responses)', () => {
    test('verifies blocked response for honeypot proposal with active freeze authority (+45 risk)', async () => {
      const mockFreeze = Keypair.generate().publicKey;
      (splToken.getMint as jest.Mock).mockResolvedValue({
        address: new PublicKey(dummyMint),
        mintAuthority: null,
        supply: BigInt(50000),
        decimals: 6,
        isInitialized: true,
        freezeAuthority: mockFreeze,
      });

      const result = (await client.callTool({
        name: 'audit_solana_trade',
        arguments: {
          targetMint: dummyMint,
          expectedOutput: 1000,
          maxSlippageBps: 100,
        },
      })) as any;

      expect(result.isError).toBeFalsy();
      const parsed: AdversarialAuditReport = JSON.parse(result.content[0].text);

      expect(parsed.decision).toBe('BLOCKED');
      expect(parsed.verdict).toContain('VETO: Transaction proposal rejected');
      expect(parsed.overallRiskScore).toBeGreaterThanOrEqual(45);
      expect(parsed.breakdown.rugProbe.hasFreezeAuthority).toBe(true);
      expect(parsed.breakdown.rugProbe.isUnsafe).toBe(true);
      expect(parsed.vetoReasons.some((r) => r.includes('RugProbe flagged mint'))).toBe(true);
      expect(parsed.recommendations.some((r) => r.includes('Refuse trading: Honeypot hazard'))).toBe(true);
    });

    test('verifies blocked response for extreme slippage / critical MEV sandwich exposure', async () => {
      (splToken.getMint as jest.Mock).mockResolvedValue({
        address: new PublicKey(dummyMint),
        mintAuthority: null,
        supply: BigInt(1_000_000),
        decimals: 6,
        isInitialized: true,
        freezeAuthority: null,
      });

      const result = (await client.callTool({
        name: 'audit_solana_trade',
        arguments: {
          targetMint: dummyMint,
          expectedOutput: 5000,
          maxSlippageBps: 750, // 7.5% slippage -> CRITICAL MEV risk
        },
      })) as any;

      expect(result.isError).toBeFalsy();
      const parsed: AdversarialAuditReport = JSON.parse(result.content[0].text);

      expect(parsed.decision).toBe('BLOCKED');
      expect(parsed.verdict).toContain('VETO: Transaction proposal rejected');
      expect(parsed.overallRiskScore).toBeGreaterThanOrEqual(50);
      expect(parsed.breakdown.mevGuard.riskLevel).toBe('CRITICAL');
      expect(parsed.breakdown.mevGuard.sandwichVulnerability).toBe(true);
      expect(parsed.vetoReasons.some((r) => r.includes('MEV Guard flagged high sandwich risk'))).toBe(true);
      expect(parsed.recommendations.some((r) => r.includes('Reduce slippage tolerance'))).toBe(true);
    });

    test('verifies blocked response when pre-flight transaction simulation reverts on-chain', async () => {
      (splToken.getMint as jest.Mock).mockResolvedValue({
        address: new PublicKey(dummyMint),
        mintAuthority: null,
        supply: BigInt(1_000_000),
        decimals: 6,
        isInitialized: true,
        freezeAuthority: null,
      });

      // Construct a valid serialized transaction wire
      const payer = Keypair.generate().publicKey;
      const dummyTx = new Transaction().add(
        SystemProgram.transfer({ fromPubkey: payer, toPubkey: payer, lamports: 0 })
      );
      dummyTx.recentBlockhash = Keypair.generate().publicKey.toBase58();
      dummyTx.feePayer = payer;
      const wireBase64 = dummyTx.serialize({ requireAllSignatures: false, verifySignatures: false }).toString('base64');

      // Mock connection.simulateTransaction to return an on-chain program revert
      (mockConnection.simulateTransaction as jest.Mock).mockResolvedValue({
        value: {
          err: { InstructionError: [0, 'Custom(1)'] },
          logs: ['Program Error: Custom(1)', 'Program instruction reverted'],
          unitsConsumed: 12000,
        },
      });

      const result = (await client.callTool({
        name: 'audit_solana_trade',
        arguments: {
          targetMint: dummyMint,
          expectedOutput: 1000,
          maxSlippageBps: 100,
          transactionBase64: wireBase64,
        },
      })) as any;

      expect(result.isError).toBeFalsy();
      const parsed: AdversarialAuditReport = JSON.parse(result.content[0].text);

      expect(parsed.decision).toBe('BLOCKED');
      expect(parsed.breakdown.simulation).toBeDefined();
      expect(parsed.breakdown.simulation?.simulatedSuccess).toBe(false);
      expect(parsed.breakdown.simulation?.vetoed).toBe(true);
      expect(parsed.vetoReasons.some((r) => r.includes('Simulation engine vetoed transaction execution'))).toBe(true);
    });
  });

  // =========================================================================
  // 5. Tool Call: probe_token_rug
  // =========================================================================
  describe('5. Tool Call: probe_token_rug', () => {
    test('returns risk report with all expected fields for clean token', async () => {
      (splToken.getMint as jest.Mock).mockResolvedValue({
        address: new PublicKey(dummyMint),
        mintAuthority: null,
        supply: BigInt(2_000_000),
        decimals: 6,
        isInitialized: true,
        freezeAuthority: null,
      });

      const result = (await client.callTool({
        name: 'probe_token_rug',
        arguments: { targetMint: dummyMint },
      })) as any;

      expect(result.isError).toBeFalsy();
      const parsed: RugRiskReport = JSON.parse(result.content[0].text);

      expect(parsed.mint).toBe(dummyMint);
      expect(typeof parsed.hasFreezeAuthority).toBe('boolean');
      expect(parsed.freezeAuthority).toBeNull();
      expect(typeof parsed.freezeRiskScore).toBe('number');
      expect(typeof parsed.hasMintAuthority).toBe('boolean');
      expect(parsed.mintAuthority).toBeNull();
      expect(typeof parsed.mintRiskScore).toBe('number');
      expect(typeof parsed.topHoldersSharePercentage).toBe('number');
      expect(typeof parsed.concentrationRiskScore).toBe('number');
      expect(Array.isArray(parsed.topHolders)).toBe(true);
      expect(typeof parsed.totalRiskScore).toBe('number');
      expect(typeof parsed.isUnsafe).toBe('boolean');
      expect(Array.isArray(parsed.reasons)).toBe(true);

      expect(parsed.hasFreezeAuthority).toBe(false);
      expect(parsed.hasMintAuthority).toBe(false);
      expect(parsed.totalRiskScore).toBe(0);
      expect(parsed.isUnsafe).toBe(false);
    });

    test('flags honeypot with active freeze authority (+45 risk)', async () => {
      const mockFreeze = Keypair.generate().publicKey;
      (splToken.getMint as jest.Mock).mockResolvedValue({
        address: new PublicKey(dummyMint),
        mintAuthority: null,
        supply: BigInt(100_000),
        decimals: 6,
        isInitialized: true,
        freezeAuthority: mockFreeze,
      });

      const result = (await client.callTool({
        name: 'probe_token_rug',
        arguments: { targetMint: dummyMint },
      })) as any;

      const parsed: RugRiskReport = JSON.parse(result.content[0].text);
      expect(parsed.hasFreezeAuthority).toBe(true);
      expect(parsed.freezeAuthority).toBe(mockFreeze.toBase58());
      expect(parsed.freezeRiskScore).toBe(45);
      expect(parsed.totalRiskScore).toBeGreaterThanOrEqual(45);
      expect(parsed.isUnsafe).toBe(true);
      expect(parsed.reasons.some((r) => r.includes('Active Freeze Authority detected'))).toBe(true);
    });

    test('detects active mint authority (+35 risk)', async () => {
      const mockMint = Keypair.generate().publicKey;
      (splToken.getMint as jest.Mock).mockResolvedValue({
        address: new PublicKey(dummyMint),
        mintAuthority: mockMint,
        supply: BigInt(100_000),
        decimals: 6,
        isInitialized: true,
        freezeAuthority: null,
      });

      const result = (await client.callTool({
        name: 'probe_token_rug',
        arguments: { targetMint: dummyMint },
      })) as any;

      const parsed: RugRiskReport = JSON.parse(result.content[0].text);
      expect(parsed.hasMintAuthority).toBe(true);
      expect(parsed.mintAuthority).toBe(mockMint.toBase58());
      expect(parsed.mintRiskScore).toBe(35);
      expect(parsed.reasons.some((r) => r.includes('Active Mint Authority detected'))).toBe(true);
    });

    test('flags whale concentration risk when top accounts hold >= 80% supply', async () => {
      (splToken.getMint as jest.Mock).mockResolvedValue({
        address: new PublicKey(dummyMint),
        mintAuthority: null,
        supply: BigInt(10000),
        decimals: 6,
        isInitialized: true,
        freezeAuthority: null,
      });

      (mockConnection.getTokenLargestAccounts as jest.Mock).mockResolvedValue({
        value: [
          {
            address: Keypair.generate().publicKey,
            amount: '8500', // 85% of 10000
            decimals: 6,
            uiAmount: 8.5,
            uiAmountString: '8.5',
          },
        ],
      });

      const result = (await client.callTool({
        name: 'probe_token_rug',
        arguments: { targetMint: dummyMint },
      })) as any;

      const parsed: RugRiskReport = JSON.parse(result.content[0].text);
      expect(parsed.topHoldersSharePercentage).toBe(85);
      expect(parsed.concentrationRiskScore).toBe(30);
      expect(parsed.reasons.some((r) => r.includes('Extreme whale concentration'))).toBe(true);
    });
  });

  // =========================================================================
  // 6. Tool Call: assess_mev_risk
  // =========================================================================
  describe('6. Tool Call: assess_mev_risk', () => {
    test('returns MEV report with expected fields and LOW risk level for safe slippage', async () => {
      const result = (await client.callTool({
        name: 'assess_mev_risk',
        arguments: { maxSlippageBps: 50, expectedOutput: 1000 },
      })) as any;

      expect(result.isError).toBeFalsy();
      const parsed: MevRiskReport = JSON.parse(result.content[0].text);

      expect(parsed.slippageBps).toBe(50);
      expect(typeof parsed.mevRiskScore).toBe('number');
      expect(parsed.riskLevel).toBe('LOW');
      expect(parsed.sandwichVulnerability).toBe(false);
      expect(typeof parsed.estimatedExtractableValueBps).toBe('number');
      expect(parsed.recommendedMaxSlippageBps).toBe(50);
      expect(Array.isArray(parsed.reasons)).toBe(true);
    });

    test('returns MEDIUM risk level for moderate slippage (150-300 bps)', async () => {
      const result = (await client.callTool({
        name: 'assess_mev_risk',
        arguments: { maxSlippageBps: 200 },
      })) as any;

      const parsed: MevRiskReport = JSON.parse(result.content[0].text);
      expect(parsed.riskLevel).toBe('MEDIUM');
      expect(parsed.sandwichVulnerability).toBe(false);
      expect(parsed.mevRiskScore).toBe(45);
    });

    test('returns HIGH risk level and sandwich vulnerability for high slippage (300-500 bps)', async () => {
      const result = (await client.callTool({
        name: 'assess_mev_risk',
        arguments: { maxSlippageBps: 400 },
      })) as any;

      const parsed: MevRiskReport = JSON.parse(result.content[0].text);
      expect(parsed.riskLevel).toBe('HIGH');
      expect(parsed.sandwichVulnerability).toBe(true);
      expect(parsed.mevRiskScore).toBe(75);
    });

    test('returns CRITICAL risk level and sandwich vulnerability for extreme slippage (>500 bps)', async () => {
      const result = (await client.callTool({
        name: 'assess_mev_risk',
        arguments: { maxSlippageBps: 700, expectedOutput: 10000 },
      })) as any;

      const parsed: MevRiskReport = JSON.parse(result.content[0].text);
      expect(parsed.riskLevel).toBe('CRITICAL');
      expect(parsed.sandwichVulnerability).toBe(true);
      expect(parsed.mevRiskScore).toBe(95);
      expect(parsed.recommendedMaxSlippageBps).toBe(100);
      expect(parsed.estimatedExtractableValueBps).toBeGreaterThan(0);
    });
  });

  // =========================================================================
  // 7. Error Handling & Server Resilience
  // =========================================================================
  describe('7. Error Handling & Server Resilience', () => {
    test('returns isError: true when calling an unknown tool without crashing the server', async () => {
      const result = (await client.callTool({
        name: 'non_existent_tool',
        arguments: {},
      })) as any;

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('Unknown tool: non_existent_tool');
    });

    test('returns isError: true when audit_solana_trade is missing required targetMint', async () => {
      const result = (await client.callTool({
        name: 'audit_solana_trade',
        arguments: { expectedOutput: 1000 },
      })) as any;

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('Sol-Inquisitor Error');
    });

    test('returns isError: true when audit_solana_trade is missing required expectedOutput', async () => {
      const result = (await client.callTool({
        name: 'audit_solana_trade',
        arguments: { targetMint: dummyMint },
      })) as any;

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('Sol-Inquisitor Error');
    });

    test('returns isError: true when audit_solana_trade has invalid targetMint length', async () => {
      const result = (await client.callTool({
        name: 'audit_solana_trade',
        arguments: { targetMint: 'short', expectedOutput: 1000 },
      })) as any;

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('Sol-Inquisitor Error');
    });

    test('returns isError: true when probe_token_rug receives invalid base58 public key', async () => {
      const result = (await client.callTool({
        name: 'probe_token_rug',
        arguments: { targetMint: 'not-a-valid-base58-key-address!' },
      })) as any;

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('Sol-Inquisitor Error');
    });

    test('ensures server remains responsive to subsequent valid calls after an error occurs', async () => {
      // 1. Trigger an error call
      const errorResult = (await client.callTool({
        name: 'audit_solana_trade',
        arguments: { targetMint: 'too_short' },
      })) as any;
      expect(errorResult.isError).toBe(true);

      // 2. Immediately execute a valid call to confirm server did not crash or hang
      const validResult = (await client.callTool({
        name: 'assess_mev_risk',
        arguments: { maxSlippageBps: 100 },
      })) as any;

      expect(validResult.isError).toBeFalsy();
      const parsed = JSON.parse(validResult.content[0].text);
      expect(parsed.riskLevel).toBe('LOW');
    });
  });
});
