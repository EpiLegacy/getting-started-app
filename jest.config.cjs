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

  /**
   * A floor, not a target (US-09). It sits just under the coverage the unit
   * suite reaches today, so the build fails the moment a change lowers it.
   * Without it, #47 took the project from 100% to 61% and CI stayed green.
   *
   * Raise these numbers as tests land. Never lower them to make a build pass.
   */
  coverageThreshold: {
    global: {
      statements: 65,
      branches: 85,
      functions: 45,
      lines: 65,
    },
  },
};
