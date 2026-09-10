/**
 * Sol-Inquisitor (@solana-agent-kit/plugin-adversary)
 * 
 * Adversarial Pre-Flight Falsification & Simulation Engine for Solana Agent Kit
 * with native Model Context Protocol (MCP) server support.
 */

export * from './types';
export * from './plugin';
export * from './modules/rugProbe';
export * from './modules/mevGuard';
export * from './modules/simulation';

import { SolInquisitorPlugin } from './plugin';
import { InquisitorConfig } from './types';

/**
 * Factory helper to instantiate the SolInquisitorPlugin
 */
export function createInquisitorPlugin(config?: InquisitorConfig): SolInquisitorPlugin {
  return new SolInquisitorPlugin(config);
}

export default SolInquisitorPlugin;
