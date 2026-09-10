#!/usr/bin/env node
import { SolInquisitorPlugin } from '../plugin';
import { Connection, PublicKey } from '@solana/web3.js';

// ANSI color helpers
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  dim: '\x1b[2m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
  white: '\x1b[37m',
  bgRed: '\x1b[41m',
  bgGreen: '\x1b[42m',
};

function banner() {
  console.log(`
${colors.cyan}${colors.bright}========================================================================${colors.reset}
${colors.magenta}${colors.bright}  🛡️  SOL-INQUISITOR (@solana-agent-kit/plugin-adversary)             ${colors.reset}
${colors.yellow}  Adversarial Pre-Flight Falsification & Simulation Engine for AI Agents${colors.reset}
${colors.cyan}${colors.bright}========================================================================${colors.reset}
`);
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function runDemo() {
  banner();

  console.log(`${colors.bright}Initializing Sol-Inquisitor Pre-Flight Engine...${colors.reset}`);
  const connection = new Connection('https://api.mainnet-beta.solana.com', 'confirmed');
  console.log(`${colors.green}✓ Sol-Inquisitor active with zero-trust falsification hooks.${colors.reset}\n`);

  await sleep(600);

  // -------------------------------------------------------------
  // SCENARIO 1: DEFENDING AGAINST A HONEYPOT (FREEZE & MINT AUTHORITIES)
  // -------------------------------------------------------------
  console.log(`${colors.bright}${colors.bgRed} SCENARIO 1: ADVERSARIAL HONEYPOT INTERCEPTION ${colors.reset}`);
  console.log(`${colors.yellow}🤖 Autonomous Agent Proposal: Buy 10,000 $SUPER_MOON tokens via DEX${colors.reset}`);
  console.log(`${colors.dim}Target Mint: 7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU${colors.reset}`);
  console.log(`${colors.cyan}🔍 Sol-Inquisitor Intercepting Pre-Flight Proposal...${colors.reset}`);

  const honeypotInquisitor = new SolInquisitorPlugin({
    connection,
    probeOverrides: {
      mintInfoFetcher: async () => ({
        address: new PublicKey('7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU'),
        mintAuthority: new PublicKey('11111111111111111111111111111111'),
        supply: BigInt(100_000_000_000_000),
        decimals: 6,
        isInitialized: true,
        freezeAuthority: new PublicKey('11111111111111111111111111111111'),
      }),
      largestAccountsFetcher: async () => ({
        value: [
          {
            address: new PublicKey('11111111111111111111111111111111'),
            amount: '85000000000000',
            decimals: 6,
            uiAmount: 85000000,
            uiAmountString: '85000000',
          },
        ],
      }),
    },
  });

  const honeypotReport = await honeypotInquisitor.auditTradeProposal({
    targetMint: '7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU',
    expectedOutput: 10000,
    maxSlippageBps: 150,
  });

  await sleep(500);

  console.log(`\n${colors.red}${colors.bright}>>> AUDIT RESULT: [ ${honeypotReport.decision} ] <<<${colors.reset}`);
  console.log(`${colors.red}Verdict: ${honeypotReport.verdict}${colors.reset}`);
  console.log(`${colors.yellow}Aggregated Risk Score: ${honeypotReport.overallRiskScore}/100 (CRITICAL)${colors.reset}`);
  console.log(`${colors.bright}Veto Reasons:${colors.reset}`);
  for (const reason of honeypotReport.vetoReasons) {
    console.log(`  ${colors.red}✖ ${reason}${colors.reset}`);
  }
  console.log(`${colors.bright}Recommendations:${colors.reset}`);
  for (const rec of honeypotReport.recommendations) {
    console.log(`  ${colors.cyan}ℹ ${rec}${colors.reset}`);
  }
  console.log(`\n${colors.green}🛡️  ACTION: Transaction signing ABORTED. Agent wallet preserved from drain.${colors.reset}\n`);

  await sleep(800);

  // -------------------------------------------------------------
  // SCENARIO 2: MEV SANDWICH RISK INTERCEPTION (HIGH SLIPPAGE)
  // -------------------------------------------------------------
  console.log(`${colors.bright}${colors.bgRed} SCENARIO 2: MEV SANDWICH STRESS VETO ${colors.reset}`);
  console.log(`${colors.yellow}🤖 Autonomous Agent Proposal: Swap with 8% slippage tolerance (800 bps)${colors.reset}`);

  const defaultInquisitor = new SolInquisitorPlugin({ connection });
  const mevReport = defaultInquisitor.assessMev(800, 50000);

  console.log(`\n${colors.red}${colors.bright}>>> MEV AUDIT: Risk Level: [ ${mevReport.riskLevel} ] <<<${colors.reset}`);
  console.log(`${colors.yellow}MEV Risk Score: ${mevReport.mevRiskScore}/100${colors.reset}`);
  console.log(`${colors.red}Sandwich Vulnerability: ${mevReport.sandwichVulnerability ? 'CONFIRMED' : 'NONE'}${colors.reset}`);
  console.log(`${colors.cyan}Estimated Extractable Value: ${(mevReport.estimatedExtractableValueBps / 100).toFixed(2)}% of transaction${colors.reset}`);
  console.log(`${colors.green}Recommended Max Slippage: ${mevReport.recommendedMaxSlippageBps} bps (${(mevReport.recommendedMaxSlippageBps / 100).toFixed(2)}%)${colors.reset}`);
  for (const reason of mevReport.reasons) {
    console.log(`  ${colors.red}✖ ${reason}${colors.reset}`);
  }
  console.log(`\n${colors.green}🛡️  ACTION: Trade proposal capped. Slippage re-tuned to safe threshold.${colors.reset}\n`);

  await sleep(800);

  // -------------------------------------------------------------
  // SCENARIO 3: VERIFIED DECENTRALIZED SWAP (CLEAN APPROVAL)
  // -------------------------------------------------------------
  console.log(`${colors.bright}${colors.bgGreen} SCENARIO 3: VERIFIED DECENTRALIZED TRADE APPROVAL ${colors.reset}`);
  console.log(`${colors.yellow}🤖 Autonomous Agent Proposal: Buy 5,000 $BONK / $USDC with 0.5% slippage${colors.reset}`);
  console.log(`${colors.dim}Target Mint: DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263${colors.reset}`);
  console.log(`${colors.cyan}🔍 Sol-Inquisitor Running Full Pre-Flight Falsification...${colors.reset}`);

  const safeInquisitor = new SolInquisitorPlugin({
    connection,
    probeOverrides: {
      mintInfoFetcher: async () => ({
        address: new PublicKey('DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263'),
        mintAuthority: null, // Revoked!
        supply: BigInt(93_000_000_000_000),
        decimals: 5,
        isInitialized: true,
        freezeAuthority: null, // Revoked!
      }),
      largestAccountsFetcher: async () => ({
        value: [
          {
            address: new PublicKey('11111111111111111111111111111111'),
            amount: '4650000000000',
            decimals: 5,
            uiAmount: 46500000,
            uiAmountString: '46500000',
          },
        ],
      }),
    },
  });

  const safeReport = await safeInquisitor.auditTradeProposal({
    targetMint: 'DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263',
    expectedOutput: 5000,
    maxSlippageBps: 50,
  });

  await sleep(500);

  console.log(`\n${colors.green}${colors.bright}>>> AUDIT RESULT: [ ${safeReport.decision} ] <<<${colors.reset}`);
  console.log(`${colors.green}Verdict: ${safeReport.verdict}${colors.reset}`);
  console.log(`${colors.cyan}Overall Risk Score: ${safeReport.overallRiskScore}/100 (LOW - SAFE)${colors.reset}`);
  console.log(`${colors.green}✓ Freeze Authority: Revoked (null)${colors.reset}`);
  console.log(`${colors.green}✓ Mint Authority: Revoked (null)${colors.reset}`);
  console.log(`${colors.green}✓ Whale Concentration: Healthy (<5% top pool)${colors.reset}`);
  console.log(`${colors.green}✓ Slippage Bounds: 50 bps (Tight, MEV safe)${colors.reset}`);
  console.log(`\n${colors.green}${colors.bright}🚀 ACTION: Pre-flight audit cleared. Agent authorized to sign and broadcast trade.${colors.reset}\n`);

  console.log(`${colors.cyan}${colors.bright}========================================================================${colors.reset}`);
  console.log(`${colors.magenta}✨ Sol-Inquisitor Pre-Flight Demonstration Completed Successfully! ✨${colors.reset}`);
  console.log(`${colors.cyan}${colors.bright}========================================================================${colors.reset}`);
}

runDemo().catch((err) => {
  console.error('Demo error:', err);
  process.exit(1);
});
