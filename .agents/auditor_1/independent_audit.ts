import { assessMevRisk } from '../../src/modules/mevGuard';
import { simulateAndVerifyProposal } from '../../src/modules/simulation';
import { probeRugRisks } from '../../src/modules/rugProbe';
import { SolInquisitorPlugin } from '../../src/plugin';
import { startMcpServer } from '../../src/mcp/server';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { Connection, PublicKey, Keypair } from '@solana/web3.js';

async function runIndependentAudit() {
  console.log('=== RUNNING INDEPENDENT FORENSIC DYNAMIC INTEGRITY AUDIT ===\n');

  let passed = 0;
  let failed = 0;

  function assert(condition: boolean, msg: string) {
    if (condition) {
      console.log(`  [PASS] ${msg}`);
      passed++;
    } else {
      console.error(`  [FAIL] ${msg}`);
      failed++;
    }
  }

  // 1. DYNAMIC CALCULATION VERIFICATION: assessMevRisk
  console.log('1. Testing assessMevRisk dynamic algorithmic calculations:');
  for (const slippage of [40, 75, 180, 320, 550, 999]) {
    const res = assessMevRisk({ maxSlippageBps: slippage });
    const expectedEV = Math.max(0, Math.round((slippage - 30) * 0.8));
    const expectedRec = Math.min(slippage, 100);
    assert(res.estimatedExtractableValueBps === expectedEV, `Dynamic EV formula for slippage ${slippage}bps: got ${res.estimatedExtractableValueBps}, expected ${expectedEV}`);
    assert(res.recommendedMaxSlippageBps === expectedRec, `Dynamic Recommended Slippage for ${slippage}bps: got ${res.recommendedMaxSlippageBps}, expected ${expectedRec}`);
  }

  // 2. DYNAMIC BALANCE DELTA VERIFICATION: simulateAndVerifyProposal
  console.log('\n2. Testing simulateAndVerifyProposal dynamic boundary calculation:');
  const dummyConn = {} as Connection;
  const dummyMint = Keypair.generate().publicKey.toBase58();
  
  // Random testing across 10 random runs
  for (let i = 0; i < 10; i++) {
    const expected = Math.floor(Math.random() * 5000) + 500;
    const slippageBps = Math.floor(Math.random() * 500) + 10; // 10 to 510 bps
    const minAcceptable = expected * (1 - slippageBps / 10000);
    
    // Exactly at minAcceptable
    const exactRes = await simulateAndVerifyProposal({
      connection: dummyConn,
      targetMint: dummyMint,
      expectedOutput: expected,
      maxSlippageBps: slippageBps,
      mockOverride: { preBalance: 0, postBalance: minAcceptable },
    });
    assert(exactRes.slippageExceeded === false, `Run ${i}: exact match postBalance=${minAcceptable} does not exceed slippage`);

    // Just below minAcceptable
    const underRes = await simulateAndVerifyProposal({
      connection: dummyConn,
      targetMint: dummyMint,
      expectedOutput: expected,
      maxSlippageBps: slippageBps,
      mockOverride: { preBalance: 0, postBalance: minAcceptable - 0.01 },
    });
    assert(underRes.slippageExceeded === true, `Run ${i}: postBalance=${minAcceptable - 0.01} triggers slippage violation`);
  }

  // 3. DYNAMIC PARAMETER WEIGHTING: probeRugRisks
  console.log('\n3. Testing probeRugRisks dynamic weight injection:');
  const customFreezeWeight = 47;
  const customMintWeight = 33;
  const customThreshold = 70;
  
  const customReport = await probeRugRisks(dummyConn, dummyMint, {
    freezeScoreWeight: customFreezeWeight,
    mintScoreWeight: customMintWeight,
    threshold: customThreshold,
    mintInfoFetcher: async () => ({
      address: new PublicKey(dummyMint),
      mintAuthority: new PublicKey('11111111111111111111111111111111'),
      freezeAuthority: null,
      supply: BigInt(1000),
      decimals: 6,
      isInitialized: true,
    }),
    largestAccountsFetcher: async () => ({ value: [] }),
  });
  
  assert(customReport.mintRiskScore === customMintWeight, `Custom mint weight applied: ${customReport.mintRiskScore} === ${customMintWeight}`);
  assert(customReport.totalRiskScore === customMintWeight, `Total risk score reflects only active weight: ${customReport.totalRiskScore} === ${customMintWeight}`);
  assert(customReport.isUnsafe === false, `Total risk ${customMintWeight} < custom threshold ${customThreshold} => isUnsafe is false`);

  // 4. LIVE IN-MEMORY MCP END-TO-END VERIFICATION
  console.log('\n4. Testing Live MCP Server Client-Server RPC Handshake & Execution:');
  const plugin = new SolInquisitorPlugin({ connection: dummyConn });
  const server = await startMcpServer(plugin);
  const [cTrans, sTrans] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: 'audit-client', version: '1.0' }, { capabilities: {} });

  await Promise.all([server.connect(sTrans), client.connect(cTrans)]);
  const tools = await client.listTools();
  assert(tools.tools.length === 3, `MCP tools listed exactly 3 tools (got ${tools.tools.length})`);

  const mevRes = await client.callTool({
    name: 'assess_mev_risk',
    arguments: { maxSlippageBps: 450 },
  }) as any;
  const parsedMev = JSON.parse(mevRes.content[0].text);
  assert(parsedMev.riskLevel === 'HIGH', `MCP assess_mev_risk returns HIGH for 450 bps`);
  assert(parsedMev.sandwichVulnerability === true, `MCP assess_mev_risk marks sandwichVulnerability=true`);

  await client.close();
  await server.close();

  console.log(`\nIndependent Audit Summary: ${passed} passed, ${failed} failed.`);
  if (failed > 0) {
    process.exit(1);
  }
}

runIndependentAudit().catch((err) => {
  console.error('Audit execution error:', err);
  process.exit(1);
});
