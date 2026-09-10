/** @type {import('ts-jest').JestConfigWithTsJest} */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  testMatch: ['**/tests/**/*.test.ts'],
  verbose: true,
  clearMocks: true,
  resetMocks: true,
  restoreMocks: true,
  transform: {
    '^.+\\.(ts|tsx|js|jsx)$': [
      'ts-jest',
      {
        tsconfig: {
          target: 'ES2022',
          module: 'CommonJS',
          strict: true,
          esModuleInterop: true,
          skipLibCheck: true,
          allowJs: true,
        },
      },
    ],
  },
  transformIgnorePatterns: [
    '/node_modules/(?!(@solana|rpc-websockets|uuid)/)',
  ],
};
