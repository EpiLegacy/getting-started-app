/**
 * Integration tests against a real MySQL 8.4 server: npm run test:integration.
 *
 * They read the same variables as the application (MYSQL_HOST, MYSQL_USER,
 * MYSQL_PASSWORD, MYSQL_DB) and refuse to run unless MYSQL_DB ends with
 * "_test", because they delete every row of the tables they use.
 *
 * The npm script starts Node with --experimental-vm-modules: the routes
 * require() uuid, which only ships as ESM. Node 24 loads it natively in
 * production, and Jest can only do the same through that VM API. The unit
 * tests mock uuid and do not need it.
 *
 * @type {import('jest').Config}
 */
const base = require('./jest.config.cjs');

// CI runners and containers default to UTC, which would hide a date written in
// local time. With another zone, only the pool's timezone: 'Z' keeps the dates
// the tests compare in UTC.
process.env.TZ = 'Europe/Paris';

module.exports = {
  ...base,
  testMatch: ['<rootDir>/spec/integration/**/*.spec.ts'],
  testPathIgnorePatterns: ['/node_modules/'],
  setupFiles: ['<rootDir>/spec/integration/support/guard.ts'],
  coverageDirectory: 'coverage/integration',
  // Every file uses the same database, so they must not run concurrently.
  maxWorkers: 1,
  // Some scenarios wait on purpose, for a lock or for the relay.
  testTimeout: 30000,
};
