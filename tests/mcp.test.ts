import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { startMcpServer } from '../src/mcp/server';
import { SolInquisitorPlugin } from '../src/plugin';
import { Connection, Keypair, PublicKey } from '@solana/web3.js';
import * as splToken from '@solana/spl-token';

jest.mock('@solana/spl-token', () => {
  const actual = jest.requireActual('@solana/spl-token');
  return {
    ...actual,
    getMint: jest.fn(),
  };
});

describe('MCP Server Integration', () => {
  let client: Client;
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
    const server = await startMcpServer(testPlugin);
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();

    client = new Client({ name: 'test-mcp-client', version: '1.0.0' }, { capabilities: {} });

    await Promise.all([
      server.connect(serverTransport),
      client.connect(clientTransport),
    ]);
  });

  afterAll(async () => {
    await client.close();
  });

  test('lists all Sol-Inquisitor MCP tools', async () => {
    const toolsResult = await client.listTools();
    const toolNames = toolsResult.tools.map((t) => t.name);

    expect(toolNames).toContain('audit_solana_trade');
    expect(toolNames).toContain('probe_token_rug');
    expect(toolNames).toContain('assess_mev_risk');
  });

  test('calls assess_mev_risk tool successfully', async () => {
    const result = (await client.callTool({
      name: 'assess_mev_risk',
      arguments: { maxSlippageBps: 700 },
    })) as any;

    expect(result.content).toBeDefined();
    expect(result.content[0].type).toBe('text');

    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.riskLevel).toBe('CRITICAL');
    expect(parsed.sandwichVulnerability).toBe(true);
    expect(parsed.recommendedMaxSlippageBps).toBe(100);
  });

  test('calls audit_solana_trade tool successfully for honeypot token', async () => {
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

    expect(result.content).toBeDefined();
    expect(result.content[0].type).toBe('text');
    const parsed = JSON.parse(result.content[0].text);

    expect(parsed.decision).toBe('BLOCKED');
    expect(parsed.overallRiskScore).toBeGreaterThanOrEqual(45);
    expect(parsed.breakdown.rugProbe.hasFreezeAuthority).toBe(true);
  });

  test('calls probe_token_rug tool successfully', async () => {
    (splToken.getMint as jest.Mock).mockResolvedValue({
      address: new PublicKey(dummyMint),
      mintAuthority: null,
      supply: BigInt(50000),
      decimals: 6,
      isInitialized: true,
      freezeAuthority: null,
    });

    const result = (await client.callTool({
      name: 'probe_token_rug',
      arguments: { targetMint: dummyMint },
    })) as any;

    expect(result.content).toBeDefined();
    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.mint).toBe(dummyMint);
    expect(parsed.hasFreezeAuthority).toBe(false);
    expect(parsed.isUnsafe).toBe(false);
  });

  test('gracefully handles missing parameters or unknown tools', async () => {
    const errorResult = (await client.callTool({
      name: 'non_existent_tool',
      arguments: {},
    })) as any;

    expect(errorResult.isError).toBe(true);
    expect(errorResult.content[0].text).toContain('Unknown tool: non_existent_tool');
  });
});
