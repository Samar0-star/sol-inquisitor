import { Connection, Transaction } from '@solana/web3.js';
import { simulateAndVerifyProposal } from '../src/modules/simulation';

describe('simulation Module', () => {
  let mockConnection: Connection;
  const dummyMint = 'So11111111111111111111111111111111111111112';

  beforeEach(() => {
    jest.clearAllMocks();
    mockConnection = {
      simulateTransaction: jest.fn(),
    } as unknown as Connection;
  });

  test('approves transaction when simulated delta satisfies expected output and slippage', async () => {
    const report = await simulateAndVerifyProposal({
      connection: mockConnection,
      targetMint: dummyMint,
      expectedOutput: 1000,
      maxSlippageBps: 100, // 1% = min output 990
      mockOverride: {
        err: null,
        logs: ['Program TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA success'],
        unitsConsumed: 25000,
        preBalance: 0,
        postBalance: 995, // 995 >= 990
      },
    });

    expect(report.simulatedSuccess).toBe(true);
    expect(report.vetoed).toBe(false);
    expect(report.actualOutputDelta).toBe(995);
    expect(report.minAcceptableOutput).toBe(990);
    expect(report.slippageExceeded).toBe(false);
  });

  test('vetoes transaction when balance delta violates maximum slippage bounds', async () => {
    const report = await simulateAndVerifyProposal({
      connection: mockConnection,
      targetMint: dummyMint,
      expectedOutput: 1000,
      maxSlippageBps: 100, // 1% = min output 990
      mockOverride: {
        err: null,
        logs: ['Program TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA success'],
        unitsConsumed: 25000,
        preBalance: 0,
        postBalance: 950, // 950 < 990 (5% slippage experienced)
      },
    });

    expect(report.simulatedSuccess).toBe(true);
    expect(report.slippageExceeded).toBe(true);
    expect(report.vetoed).toBe(true);
    expect(report.actualOutputDelta).toBe(950);
    expect(report.minAcceptableOutput).toBe(990);
    expect(report.reasons.some((r) => r.includes('Pre-flight balance delta violation'))).toBe(true);
  });

  test('vetoes transaction when simulation execution reverts on-chain', async () => {
    const report = await simulateAndVerifyProposal({
      connection: mockConnection,
      targetMint: dummyMint,
      expectedOutput: 1000,
      maxSlippageBps: 100,
      mockOverride: {
        err: { InstructionError: [2, 'Custom(1)'] },
        logs: ['Program log: Error: SlippageExceeded', 'Program aborted'],
        unitsConsumed: 12000,
      },
    });

    expect(report.simulatedSuccess).toBe(false);
    expect(report.vetoed).toBe(true);
    expect(report.reasons.some((r) => r.includes('Simulation reverted'))).toBe(true);
  });

  test('executes RPC simulateTransaction directly when raw transaction is provided', async () => {
    const dummyTx = new Transaction();
    (mockConnection.simulateTransaction as jest.Mock).mockResolvedValue({
      value: {
        err: null,
        logs: ['Instruction: TransferChecked', 'Program return: success'],
        unitsConsumed: 18450,
      },
    });

    const report = await simulateAndVerifyProposal({
      connection: mockConnection,
      targetMint: dummyMint,
      expectedOutput: 500,
      maxSlippageBps: 50,
      transaction: dummyTx,
    });

    expect(mockConnection.simulateTransaction).toHaveBeenCalled();
    expect(report.simulatedSuccess).toBe(true);
    expect(report.vetoed).toBe(false);
    expect(report.unitsConsumed).toBe(18450);
  });

  test('handles RPC connection failure securely by vetoing transaction', async () => {
    const dummyTx = new Transaction();
    (mockConnection.simulateTransaction as jest.Mock).mockRejectedValue(new Error('Connection refused'));

    const report = await simulateAndVerifyProposal({
      connection: mockConnection,
      targetMint: dummyMint,
      expectedOutput: 500,
      maxSlippageBps: 50,
      transaction: dummyTx,
    });

    expect(report.simulatedSuccess).toBe(false);
    expect(report.vetoed).toBe(true);
    expect(report.reasons.some((r) => r.includes('RPC simulateTransaction call failed'))).toBe(true);
  });

  test('handles parameter dry-run proposal when no transaction wire is supplied', async () => {
    const report = await simulateAndVerifyProposal({
      connection: mockConnection,
      targetMint: dummyMint,
      expectedOutput: 200,
      maxSlippageBps: 100,
    });

    expect(report.simulatedSuccess).toBe(true);
    expect(report.vetoed).toBe(false);
    expect(report.actualOutputDelta).toBe(200);
  });
});
