import { MevGuardInput, MevRiskLevel, MevRiskReport } from '../types';

/**
 * MEV Guard
 * 
 * Stress-tests the trade proposal's slippage settings to protect against
 * Solana searcher sandwich attacks and predatory front-running.
 */
export function assessMevRisk(input: MevGuardInput): MevRiskReport {
  const { maxSlippageBps, tradeSizeUsd } = input;
  const reasons: string[] = [];

  let mevRiskScore = 0;
  let riskLevel: MevRiskLevel = 'LOW';
  let sandwichVulnerability = false;

  // Slippage stress-testing
  // 100 bps = 1.0%
  if (maxSlippageBps > 500) {
    // Over 5% slippage is almost guaranteed sandwich bait on Solana
    mevRiskScore = 95;
    riskLevel = 'CRITICAL';
    sandwichVulnerability = true;
    reasons.push(
      `Extreme slippage tolerance (${(maxSlippageBps / 100).toFixed(2)}%). Jito MEV sandwich searchers will frontrun and drain maximum allowable slippage.`
    );
  } else if (maxSlippageBps > 300) {
    // 3% - 5%
    mevRiskScore = 75;
    riskLevel = 'HIGH';
    sandwichVulnerability = true;
    reasons.push(
      `High slippage tolerance (${(maxSlippageBps / 100).toFixed(2)}%). High risk of sandwich attack on decentralized exchanges.`
    );
  } else if (maxSlippageBps > 150) {
    // 1.5% - 3%
    mevRiskScore = 45;
    riskLevel = 'MEDIUM';
    sandwichVulnerability = false;
    reasons.push(
      `Moderate slippage tolerance (${(maxSlippageBps / 100).toFixed(2)}%). Sub-optimal execution risk under volatile conditions.`
    );
  } else if (maxSlippageBps > 50) {
    // 0.5% - 1.5%
    mevRiskScore = 15;
    riskLevel = 'LOW';
    sandwichVulnerability = false;
    reasons.push(`Standard slippage tolerance (${(maxSlippageBps / 100).toFixed(2)}%). Normal MEV exposure.`);
  } else {
    // <= 0.5%
    mevRiskScore = 5;
    riskLevel = 'LOW';
    sandwichVulnerability = false;
    reasons.push(`Tight slippage tolerance (${(maxSlippageBps / 100).toFixed(2)}%). Strong protection against sandwich attacks.`);
  }

  // Adjust for trade size if available
  if (tradeSizeUsd && tradeSizeUsd > 10000 && maxSlippageBps > 100) {
    mevRiskScore = Math.min(100, mevRiskScore + 15);
    reasons.push(`Large order size ($${tradeSizeUsd.toLocaleString()}) increases sandwich bounty attractiveness.`);
  }

  // Extractable value estimation in BPS (sandwich bots capture ~80% of excess slippage beyond baseline 30 bps)
  const baselineFairSlippageBps = 30;
  const estimatedExtractableValueBps = Math.max(
    0,
    Math.round((maxSlippageBps - baselineFairSlippageBps) * 0.8)
  );

  // Recommended max slippage
  const recommendedMaxSlippageBps = Math.min(maxSlippageBps, 100);

  return {
    slippageBps: maxSlippageBps,
    mevRiskScore,
    riskLevel,
    sandwichVulnerability,
    estimatedExtractableValueBps,
    recommendedMaxSlippageBps,
    reasons,
  };
}
