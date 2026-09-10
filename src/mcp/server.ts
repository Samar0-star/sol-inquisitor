#!/usr/bin/env node
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { SolInquisitorPlugin } from '../plugin';
import { InquisitorConfig, MevGuardInputSchema, RugProbeInputSchema, TradeProposalSchema } from '../types';

/**
 * Sol-Inquisitor MCP Stdio Server
 * 
 * Exposes adversarial pre-flight audit capabilities over the Model Context Protocol (MCP).
 * Compatible with Claude Desktop, Cursor, and Antigravity.
 */
export async function startMcpServer(
  inquisitorOrConfig?: SolInquisitorPlugin | InquisitorConfig
): Promise<Server> {
  const inquisitor =
    inquisitorOrConfig instanceof SolInquisitorPlugin
      ? inquisitorOrConfig
      : new SolInquisitorPlugin(inquisitorOrConfig);

  const server = new Server(
    {
      name: 'sol-inquisitor',
      version: '1.0.0',
    },
    {
      capabilities: {
        tools: {},
      },
    }
  );

  // List Tools
  server.setRequestHandler(ListToolsRequestSchema, async () => {
    return {
      tools: [
        {
          name: 'audit_solana_trade',
          description:
            'Adversarially falsifies and audits a proposed Solana trade before signing. Detects honeypots, freeze authorities (+45 risk), mint authorities (+35 risk), whale concentration, MEV sandwich risk, and pre-flight balance delta violations. Returns APPROVED or BLOCKED.',
          inputSchema: {
            type: 'object',
            properties: {
              targetMint: {
                type: 'string',
                description: 'Solana token mint base58 address',
              },
              expectedOutput: {
                type: 'number',
                description: 'Expected output token quantity',
              },
              maxSlippageBps: {
                type: 'number',
                description: 'Maximum tolerated slippage in basis points (100 = 1%)',
                default: 100,
              },
              walletPublicKey: {
                type: 'string',
                description: 'Optional public key of the trader/agent wallet',
              },
              transactionBase64: {
                type: 'string',
                description: 'Optional base64 serialized transaction for RPC balance delta simulation',
              },
              rpcUrl: {
                type: 'string',
                description: 'Optional custom Solana RPC URL',
              },
            },
            required: ['targetMint', 'expectedOutput'],
          },
        },
        {
          name: 'probe_token_rug',
          description:
            'Deeply inspects a Solana token mint for unrevoked freeze authority (+45 risk), mint authority (+35 risk), and whale concentration. Returns risk score and honeypot flags.',
          inputSchema: {
            type: 'object',
            properties: {
              targetMint: {
                type: 'string',
                description: 'Solana token mint address to probe',
              },
            },
            required: ['targetMint'],
          },
        },
        {
          name: 'assess_mev_risk',
          description:
            'Stress-tests trade slippage settings to protect against predatory MEV sandwich bots on Solana.',
          inputSchema: {
            type: 'object',
            properties: {
              maxSlippageBps: {
                type: 'number',
                description: 'Slippage in basis points (e.g. 100 = 1%)',
              },
              expectedOutput: {
                type: 'number',
                description: 'Expected token output quantity',
              },
            },
            required: ['maxSlippageBps'],
          },
        },
      ],
    };
  });

  // Call Tool
  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;

    try {
      if (name === 'audit_solana_trade') {
        const validated = TradeProposalSchema.parse({
          targetMint: args?.targetMint,
          expectedOutput: args?.expectedOutput !== undefined ? Number(args.expectedOutput) : undefined,
          maxSlippageBps: args?.maxSlippageBps !== undefined ? Number(args.maxSlippageBps) : undefined,
          walletPublicKey: args?.walletPublicKey,
          transactionBase64: args?.transactionBase64,
          rpcUrl: args?.rpcUrl,
        });

        const auditReport = await inquisitor.auditTradeProposal(validated);

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(auditReport, null, 2),
            },
          ],
        };
      }

      if (name === 'probe_token_rug') {
        const validated = RugProbeInputSchema.parse({
          targetMint: args?.targetMint,
        });
        const rugReport = await inquisitor.probeRug(validated.targetMint);

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(rugReport, null, 2),
            },
          ],
        };
      }

      if (name === 'assess_mev_risk') {
        const validated = MevGuardInputSchema.parse({
          maxSlippageBps: args?.maxSlippageBps !== undefined ? Number(args.maxSlippageBps) : undefined,
          expectedOutput: args?.expectedOutput !== undefined ? Number(args.expectedOutput) : undefined,
          tradeSizeUsd: args?.tradeSizeUsd !== undefined ? Number(args.tradeSizeUsd) : undefined,
        });
        const mevReport = inquisitor.assessMev(validated.maxSlippageBps, validated.expectedOutput);

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(mevReport, null, 2),
            },
          ],
        };
      }

      throw new Error(`Unknown tool: ${name}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return {
        isError: true,
        content: [
          {
            type: 'text',
            text: `Sol-Inquisitor Error: ${message}`,
          },
        ],
      };
    }
  });

  return server;
}

// Auto-start if executed directly via CLI
if (require.main === module) {
  startMcpServer().then(async (server) => {
    const transport = new StdioServerTransport();
    await server.connect(transport);
    process.stderr.write('🛡️  Sol-Inquisitor MCP Server running on stdio\n');
  }).catch((err) => {
    process.stderr.write(`Fatal error in Sol-Inquisitor MCP Server: ${err}\n`);
    process.exit(1);
  });
}
