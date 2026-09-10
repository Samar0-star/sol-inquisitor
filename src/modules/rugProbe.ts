import { Connection, PublicKey } from '@solana/web3.js';
import { getMint } from '@solana/spl-token';
import { RugRiskReport, TopHolderInfo } from '../types';

export interface RugProbeOptions {
  freezeScoreWeight?: number; // default +45
  mintScoreWeight?: number;   // default +35
  threshold?: number;         // default 40
  mintInfoFetcher?: (connection: Connection, mint: PublicKey) => Promise<any>;
  largestAccountsFetcher?: (connection: Connection, mint: PublicKey) => Promise<any>;
}

/**
 * Token Rug Probe
 * 
 * Inspects a target Solana mint for honeypot, infinite mint, and concentration risks:
 * 1. Freeze Authority: If present (+45 risk), creator can freeze token accounts, preventing selling.
 * 2. Mint Authority: If present (+35 risk), creator can inflate supply at will and dump liquidity.
 * 3. Holder Concentration: If top holders hold an abnormal share of circulating supply, adds concentration penalty.
 * 4. Overall Decision: If total risk score >= threshold (default 40), flagged as UNSAFE.
 */
export async function probeRugRisks(
  connection: Connection,
  targetMintStr: string,
  options: RugProbeOptions = {}
): Promise<RugRiskReport> {
  const freezeWeight = options.freezeScoreWeight ?? 45;
  const mintWeight = options.mintScoreWeight ?? 35;
  const threshold = options.threshold ?? 40;

  const reasons: string[] = [];

  let freezeRiskScore = 0;
  let mintRiskScore = 0;
  let concentrationRiskScore = 0;
  let hasFreezeAuthority = false;
  let freezeAuthority: string | null = null;
  let hasMintAuthority = false;
  let mintAuthority: string | null = null;
  let topHoldersSharePercentage = 0;
  const topHolders: TopHolderInfo[] = [];

  // 1. Inspect Mint Account
  try {
    const mintPubkey = new PublicKey(targetMintStr);
    const mintInfo = options.mintInfoFetcher
      ? await options.mintInfoFetcher(connection, mintPubkey)
      : await getMint(connection, mintPubkey);

    if (mintInfo.freezeAuthority !== null) {
      hasFreezeAuthority = true;
      freezeAuthority = mintInfo.freezeAuthority.toBase58();
      freezeRiskScore = freezeWeight;
      reasons.push(`Active Freeze Authority detected (${freezeAuthority}). Creator can freeze token balances (+${freezeWeight} Risk).`);
    }

    if (mintInfo.mintAuthority !== null) {
      hasMintAuthority = true;
      mintAuthority = mintInfo.mintAuthority.toBase58();
      mintRiskScore = mintWeight;
      reasons.push(`Active Mint Authority detected (${mintAuthority}). Creator can inflate supply arbitrarily (+${mintWeight} Risk).`);
    }

    // 2. Inspect Holder Concentration
    const totalCirculatingSupply = Number(mintInfo.supply);

    if (totalCirculatingSupply > 0) {
      try {
        const largestAccountsResp = options.largestAccountsFetcher
          ? await options.largestAccountsFetcher(connection, mintPubkey)
          : await connection.getTokenLargestAccounts(mintPubkey);
        const largestAccounts = largestAccountsResp.value || [];

        let top5Accumulated = 0;
        const top5 = largestAccounts.slice(0, 5);

        for (const acc of top5) {
          const rawAmount = Number(acc.amount);
          const pct = (rawAmount / totalCirculatingSupply) * 100;
          top5Accumulated += rawAmount;

          topHolders.push({
            address: acc.address.toBase58(),
            amount: acc.amount,
            uiAmount: acc.uiAmount ?? null,
            percentage: Number(pct.toFixed(2)),
          });
        }

        topHoldersSharePercentage = Number(((top5Accumulated / totalCirculatingSupply) * 100).toFixed(2));

        if (topHoldersSharePercentage >= 80) {
          concentrationRiskScore = 30;
          reasons.push(`Extreme whale concentration: Top 5 accounts control ${topHoldersSharePercentage}% of total supply (+30 Risk).`);
        } else if (topHoldersSharePercentage >= 50) {
          concentrationRiskScore = 20;
          reasons.push(`Elevated holder concentration: Top 5 accounts control ${topHoldersSharePercentage}% of total supply (+20 Risk).`);
        } else if (topHoldersSharePercentage >= 35) {
          concentrationRiskScore = 10;
          reasons.push(`Moderate holder concentration: Top 5 accounts control ${topHoldersSharePercentage}% of total supply (+10 Risk).`);
        }
      } catch (holderErr) {
        // Largest accounts query may fail on private or mock nodes; log soft notice
        reasons.push(`Holder concentration query unavailable: ${(holderErr as Error).message}`);
      }
    }
  } catch (err) {
    const errorMsg = (err as Error).message;
    return {
      mint: targetMintStr,
      hasFreezeAuthority: true, // Fail-safe default
      freezeAuthority: 'UNKNOWN_VERIFICATION_FAILED',
      freezeRiskScore: 50,
      hasMintAuthority: true,
      mintAuthority: 'UNKNOWN_VERIFICATION_FAILED',
      mintRiskScore: 50,
      topHoldersSharePercentage: 100,
      concentrationRiskScore: 20,
      topHolders: [],
      totalRiskScore: 100,
      isUnsafe: true,
      reasons: [`Failed to query mint metadata on-chain: ${errorMsg}. Flagged as unsafe by fail-secure protocol.`],
    };
  }

  const totalRiskScore = freezeRiskScore + mintRiskScore + concentrationRiskScore;
  const isUnsafe = totalRiskScore >= threshold;

  return {
    mint: targetMintStr,
    hasFreezeAuthority,
    freezeAuthority,
    freezeRiskScore,
    hasMintAuthority,
    mintAuthority,
    mintRiskScore,
    topHoldersSharePercentage,
    concentrationRiskScore,
    topHolders,
    totalRiskScore,
    isUnsafe,
    reasons,
  };
}
