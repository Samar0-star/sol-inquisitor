import { z } from 'zod';
import type { Connection, Transaction, VersionedTransaction, PublicKey } from '@solana/web3.js';

// ==========================================
// ZOD VALIDATION SCHEMAS
// ==========================================

export const TradeProposalSchema = z.object({
  targetMint: z
    .string()
    .min(32, 'Target mint must be a valid Solana base58 address')
    .max(44, 'Target mint must be a valid Solana base58 address')
    .describe('Base58 public key of the target token to be purchased or traded for'),
  expectedOutput: z
    .number()
    .positive('Expected output must be greater than zero')
    .describe('Expected output amount of the target token'),
  maxSlippageBps: z
    .number()
    .min(0, 'Max slippage must be non-negative')
    .max(10000, 'Max slippage cannot exceed 100% (10000 bps)')
    .default(100)
    .describe('Maximum tolerated slippage in basis points (100 bps = 1%)'),
  walletPublicKey: z
    .string()
    .optional()
    .describe('Base58 public key of the agent wallet executing the transaction'),
  inputMint: z
    .string()
    .optional()
    .describe('Base58 public key of the input token being spent (e.g. WSOL)'),
  inputAmount: z
    .number()
    .positive()
    .optional()
    .describe('Amount of input token being sold'),
  transactionBase64: z
    .string()
    .optional()
    .describe('Optional Base64-encoded serialized wire transaction to simulate'),
  rpcUrl: z
    .string()
    .url()
    .optional()
    .describe('Optional custom RPC endpoint for pre-flight falsification'),
});

export type TradeProposalInput = z.infer<typeof TradeProposalSchema>;

export const RugProbeInputSchema = z.object({
  targetMint: z.string().min(32).max(44).describe('Base58 public key of the token mint to probe'),
});

export type RugProbeInput = z.infer<typeof RugProbeInputSchema>;

export const MevGuardInputSchema = z.object({
  maxSlippageBps: z.number().min(0).max(10000).describe('Slippage tolerance in basis points'),
  expectedOutput: z.number().positive().optional().describe('Expected token output quantity'),
  tradeSizeUsd: z.number().positive().optional().describe('Estimated trade size in USD'),
});

export type MevGuardInput = z.infer<typeof MevGuardInputSchema>;

// ==========================================
// AUDIT & ENGINE INTERFACES
// ==========================================

export interface TopHolderInfo {
  address: string;
  amount: string;
  uiAmount: number | null;
  percentage: number;
}

export interface RugRiskReport {
  mint: string;
  hasFreezeAuthority: boolean;
  freezeAuthority: string | null;
  freezeRiskScore: number;
  hasMintAuthority: boolean;
  mintAuthority: string | null;
  mintRiskScore: number;
  topHoldersSharePercentage: number;
  concentrationRiskScore: number;
  topHolders: TopHolderInfo[];
  totalRiskScore: number;
  isUnsafe: boolean;
  reasons: string[];
}

export interface SimulationReport {
  simulatedSuccess: boolean;
  unitsConsumed: number;
  logs: string[];
  preBalance: number;
  postBalance: number;
  actualOutputDelta: number;
  expectedOutput: number;
  minAcceptableOutput: number;
  effectiveSlippageBps: number;
  slippageExceeded: boolean;
  vetoed: boolean;
  reasons: string[];
}

export type MevRiskLevel = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';

export interface MevRiskReport {
  slippageBps: number;
  mevRiskScore: number;
  riskLevel: MevRiskLevel;
  sandwichVulnerability: boolean;
  estimatedExtractableValueBps: number;
  recommendedMaxSlippageBps: number;
  reasons: string[];
}

export type InquisitorDecision = 'APPROVED' | 'BLOCKED';

export interface AdversarialAuditReport {
  decision: InquisitorDecision;
  verdict: string;
  overallRiskScore: number;
  timestamp: number;
  targetMint: string;
  breakdown: {
    rugProbe: RugRiskReport;
    simulation: SimulationReport | null;
    mevGuard: MevRiskReport;
  };
  vetoReasons: string[];
  recommendations: string[];
}

export interface InquisitorConfig {
  connection?: Connection;
  rpcUrl?: string;
  rugScoreThreshold?: number; // default 40
  mevScoreThreshold?: number; // default 50
  strictSimulationRequired?: boolean; // default false (require tx simulation to approve)
  probeOverrides?: {
    freezeScoreWeight?: number;
    mintScoreWeight?: number;
    threshold?: number;
    mintInfoFetcher?: (connection: Connection, mint: PublicKey) => Promise<any>;
    largestAccountsFetcher?: (connection: Connection, mint: PublicKey) => Promise<any>;
  };
}

// Solana Agent Kit Plugin Action Structure
export interface PluginActionExample {
  input: Record<string, unknown>;
  output: Record<string, unknown>;
  explanation: string;
}

export interface PluginAction<T = any> {
  name: string;
  description: string;
  similes: string[];
  examples: PluginActionExample[];
  schema: z.ZodType<T>;
  handler: (agent: any, input: any) => Promise<any>;
}

export interface SimulationContext {
  connection: Connection;
  transaction?: Transaction | VersionedTransaction | string;
  walletPublicKey?: string;
  targetMint: string;
  expectedOutput: number;
  maxSlippageBps: number;
}
