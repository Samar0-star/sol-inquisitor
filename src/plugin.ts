import { Connection, clusterApiUrl } from '@solana/web3.js';
import {
  AdversarialAuditReport,
  InquisitorConfig,
  InquisitorDecision,
  MevGuardInputSchema,
  MevRiskReport,
  PluginAction,
  RugProbeInputSchema,
  RugRiskReport,
  SimulationContext,
  SimulationReport,
  TradeProposalInput,
  TradeProposalSchema,
} from './types';
import { probeRugRisks } from './modules/rugProbe';
import { assessMevRisk } from './modules/mevGuard';
import { simulateAndVerifyProposal } from './modules/simulation';

/**
 * Sol-Inquisitor Plugin for Solana Agent Kit V2
 * 
 * Adversarial Pre-Flight Falsification & Simulation Engine.
 * Intercepts autonomous agent transaction proposals, tests them adversarially,
 * and vetoes unsafe trades before signing or broadcasting.
 */
export class SolInquisitorPlugin {
  public readonly name = 'adversary_inquisitor';
  public readonly description =
    'Adversarial Pre-Flight Falsification & Simulation Engine that intercepts agent transaction proposals, tests them adversarially, and vetoes unsafe transactions before signing.';

  private connection: Connection;
  private rugScoreThreshold: number;
  private mevScoreThreshold: number;
  private strictSimulationRequired: boolean;
  private probeOverrides?: InquisitorConfig['probeOverrides'];

  constructor(config: InquisitorConfig = {}) {
    if (config.connection) {
      this.connection = config.connection;
    } else if (config.rpcUrl) {
      this.connection = new Connection(config.rpcUrl, 'confirmed');
    } else {
      const defaultRpc = process.env.SOLANA_RPC_URL || clusterApiUrl('mainnet-beta');
      this.connection = new Connection(defaultRpc, 'confirmed');
    }

    this.rugScoreThreshold = config.rugScoreThreshold ?? 40;
    this.mevScoreThreshold = config.mevScoreThreshold ?? 50;
    this.strictSimulationRequired = config.strictSimulationRequired ?? false;
    this.probeOverrides = config.probeOverrides;
  }

  /**
   * Set or update the active Solana connection
   */
  public setConnection(connection: Connection): void {
    this.connection = connection;
  }

  /**
   * Get active connection
   */
  public getConnection(): Connection {
    return this.connection;
  }

  /**
   * Core Pre-Flight Falsification & Audit Pipeline
   * 
   * Orchestrates RugProbe, MevGuard, and Simulation to produce a deterministic
   * APPROVED or BLOCKED trade verdict with full adversarial rationale.
   */
  public async auditTradeProposal(
    rawProposal: TradeProposalInput
  ): Promise<AdversarialAuditReport> {
    // 1. Validate Proposal Input Schema
    const proposal = TradeProposalSchema.parse(rawProposal);
    const { targetMint, expectedOutput, maxSlippageBps, walletPublicKey, transactionBase64 } =
      proposal;

    const vetoReasons: string[] = [];
    const recommendations: string[] = [];

    // 2. Module A: Rug Probe (Freeze Authority, Mint Authority, Whale Concentration)
    const rugProbeReport = await probeRugRisks(this.connection, targetMint, {
      threshold: this.rugScoreThreshold,
      ...this.probeOverrides,
    });

    if (rugProbeReport.isUnsafe) {
      vetoReasons.push(
        `RugProbe flagged mint ${targetMint} as UNSAFE (Risk Score: ${rugProbeReport.totalRiskScore}/100, Threshold: ${this.rugScoreThreshold}).`
      );
      for (const reason of rugProbeReport.reasons) {
        vetoReasons.push(`- ${reason}`);
      }
    }

    // 3. Module B: MEV Guard (Slippage Stress-Testing & Sandwich Vulnerability)
    const mevGuardReport = assessMevRisk({
      maxSlippageBps,
      expectedOutput,
    });

    if (mevGuardReport.mevRiskScore >= this.mevScoreThreshold) {
      vetoReasons.push(
        `MEV Guard flagged high sandwich risk (Risk Score: ${mevGuardReport.mevRiskScore}/100, Slippage: ${(maxSlippageBps / 100).toFixed(2)}%).`
      );
      recommendations.push(
        `Reduce slippage tolerance to maximum ${mevGuardReport.recommendedMaxSlippageBps} bps (${(mevGuardReport.recommendedMaxSlippageBps / 100).toFixed(2)}%).`
      );
    }

    // 4. Module C: Simulation & Balance Delta Diffing
    let simulationReport: SimulationReport | null = null;

    if (transactionBase64 || this.strictSimulationRequired) {
      simulationReport = await simulateAndVerifyProposal({
        connection: this.connection,
        targetMint,
        expectedOutput,
        maxSlippageBps,
        walletPublicKey,
        transaction: transactionBase64,
      });

      if (simulationReport.vetoed) {
        vetoReasons.push('Simulation engine vetoed transaction execution:');
        for (const simReason of simulationReport.reasons) {
          vetoReasons.push(`- ${simReason}`);
        }
      }
    }

    // 5. Final Aggregated Decision
    const overallRiskScore = Math.min(
      100,
      Math.max(
        rugProbeReport.totalRiskScore,
        mevGuardReport.mevRiskScore,
        simulationReport?.vetoed ? 100 : 0
      )
    );

    const isBlocked =
      rugProbeReport.isUnsafe ||
      mevGuardReport.mevRiskScore >= this.mevScoreThreshold ||
      (simulationReport !== null && simulationReport.vetoed);

    const decision: InquisitorDecision = isBlocked ? 'BLOCKED' : 'APPROVED';

    let verdict: string;
    if (decision === 'BLOCKED') {
      verdict = `VETO: Transaction proposal rejected by Sol-Inquisitor. Adversarial hazards detected.`;
    } else {
      verdict = `PASSED: Transaction proposal cleared all adversarial pre-flight falsification tests. Safe to sign.`;
    }

    if (rugProbeReport.hasFreezeAuthority) {
      recommendations.push('Refuse trading: Honeypot hazard due to unrevoked freeze authority.');
    }
    if (rugProbeReport.hasMintAuthority) {
      recommendations.push('Refuse trading: Infinite supply dilution hazard due to unrevoked mint authority.');
    }
    if (rugProbeReport.topHoldersSharePercentage > 50) {
      recommendations.push(`Monitor whale wallets; top 5 holders own ${rugProbeReport.topHoldersSharePercentage}% of circulating supply.`);
    }

    return {
      decision,
      verdict,
      overallRiskScore,
      timestamp: Date.now(),
      targetMint,
      breakdown: {
        rugProbe: rugProbeReport,
        simulation: simulationReport,
        mevGuard: mevGuardReport,
      },
      vetoReasons,
      recommendations,
    };
  }

  /**
   * Direct Helper: Probe Token Rug Risk
   */
  public async probeRug(targetMint: string): Promise<RugRiskReport> {
    return probeRugRisks(this.connection, targetMint, {
      threshold: this.rugScoreThreshold,
      ...this.probeOverrides,
    });
  }

  /**
   * Direct Helper: Assess MEV Risk
   */
  public assessMev(slippageBps: number, expectedOutput?: number): MevRiskReport {
    return assessMevRisk({
      maxSlippageBps: slippageBps,
      expectedOutput,
    });
  }

  /**
   * Direct Helper: Simulate Proposal
   */
  public async simulateProposal(context: SimulationContext): Promise<SimulationReport> {
    return simulateAndVerifyProposal({
      connection: this.connection,
      targetMint: context.targetMint,
      expectedOutput: context.expectedOutput,
      maxSlippageBps: context.maxSlippageBps,
      walletPublicKey: context.walletPublicKey,
      transaction: context.transaction,
    });
  }

  /**
   * Solana Agent Kit V2 Plugin Actions
   * Exposes structured tool actions for autonomous agent planners.
   */
  public get actions(): PluginAction[] {
    return [
      {
        name: 'audit_trade_proposal',
        description:
          'Adversarially audits a proposed Solana trade or swap before signing. Evaluates freeze/mint authorities, whale concentration, MEV sandwich risk, and pre-flight RPC balance deltas. Returns APPROVED or BLOCKED.',
        similes: [
          'audit trade',
          'verify token safety',
          'check for honeypot',
          'pre-flight simulation',
          'check slippage risk',
        ],
        examples: [
          {
            input: {
              targetMint: 'DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263',
              expectedOutput: 1000000,
              maxSlippageBps: 100,
            },
            output: {
              decision: 'APPROVED',
              verdict: 'PASSED: Transaction proposal cleared all adversarial pre-flight falsification tests.',
              overallRiskScore: 15,
            },
            explanation: 'Clean decentralized token with revoked freeze and mint authorities audited and approved.',
          },
        ],
        schema: TradeProposalSchema,
        handler: async (_agent: unknown, input: TradeProposalInput) => {
          return await this.auditTradeProposal(input);
        },
      },
      {
        name: 'probe_token_rug',
        description:
          'Probes a Solana token mint for freeze authority (+45 risk), mint authority (+35 risk), and whale holder concentration. Rejects with unsafe flag if risk >= 40.',
        similes: ['check freeze authority', 'check mint authority', 'probe rug risk', 'is honeypot'],
        examples: [
          {
            input: {
              targetMint: '4k3Dyjzvzp8eMZWUXbBCjEvwSkkk59S5iCNLY3QrkX6R',
            },
            output: {
              mint: '4k3Dyjzvzp8eMZWUXbBCjEvwSkkk59S5iCNLY3QrkX6R',
              hasFreezeAuthority: true,
              totalRiskScore: 45,
              isUnsafe: true,
            },
            explanation: 'Flags token with active freeze authority as unsafe honeypot.',
          },
        ],
        schema: RugProbeInputSchema,
        handler: async (_agent: unknown, input: { targetMint: string }) => {
          return await this.probeRug(input.targetMint);
        },
      },
      {
        name: 'assess_mev_risk',
        description:
          'Evaluates trade slippage settings to prevent Jito sandwich attacks and excessive extractable value on Solana DEXes.',
        similes: ['check mev risk', 'check sandwich attack', 'check slippage risk'],
        examples: [
          {
            input: {
              maxSlippageBps: 500,
            },
            output: {
              mevRiskScore: 95,
              riskLevel: 'CRITICAL',
              sandwichVulnerability: true,
            },
            explanation: 'Detects 5% slippage as critical sandwich target.',
          },
        ],
        schema: MevGuardInputSchema,
        handler: async (_agent: unknown, input: { maxSlippageBps: number; expectedOutput?: number }) => {
          return this.assessMev(input.maxSlippageBps, input.expectedOutput);
        },
      },
    ];
  }
}
