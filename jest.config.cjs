/** @type {import('jest').Config} */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  clearMocks: true,
  collectCoverage: true,
  coverageDirectory: 'coverage',
  coverageProvider: 'v8',
  // spec/integration needs a MySQL server: it has its own configuration,
  // jest.integration.config.cjs (npm run test:integration).
  testPathIgnorePatterns: ['/node_modules/', '<rootDir>/spec/integration/'],
  setupFiles: ['<rootDir>/spec/support/unit-env.ts'],
};
