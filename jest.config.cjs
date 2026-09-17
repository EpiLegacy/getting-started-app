/** @type {import('jest').Config} */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  clearMocks: true,
  collectCoverage: true,
  coverageDirectory: 'coverage',
  coverageProvider: 'v8',

  /**
   * A floor, not a target (US-09). It sits just under the coverage the suite
   * reaches today, so the build fails the moment a change lowers it. Without
   * it, #47 dropped the project from 100% to 61% and CI stayed green.
   *
   * Raise these numbers as tests land. Never lower them to make a build pass.
   */
  coverageThreshold: {
    global: {
      statements: 60,
      branches: 85,
      functions: 50,
      lines: 60,
    },
  },
};
