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
const path = require('node:path');
const dotenv = require('dotenv');

// Explicit shell/CI settings win, followed by test-specific settings. Reuse
// local connection settings, but never inherit the application's database:
// these suites delete data. The guard still rejects an explicit unsafe name.
dotenv.config({ path: path.join(__dirname, '.env.integration'), quiet: true });
const local = {};
dotenv.config({ path: path.join(__dirname, '.env'), processEnv: local, quiet: true });
delete local.MYSQL_DB;
dotenv.populate(process.env, local);
process.env.MYSQL_DB ??= 'todos_test';
process.env.MYSQL_HOST ??= '127.0.0.1';

// CI runners and containers default to UTC, which would hide a date written in
// local time. With another zone, only the pool's timezone: 'Z' keeps the dates
// the tests compare in UTC.
process.env.TZ = 'Europe/Paris';

module.exports = {
  ...base,
  testMatch: ['<rootDir>/spec/integration/**/*.spec.ts'],
  testPathIgnorePatterns: ['/node_modules/'],
  setupFiles: ['<rootDir>/spec/integration/support/guard.ts'],
  setupFilesAfterEnv: ['<rootDir>/spec/integration/support/setup.ts'],
  // Leave the database on the current schema after suites that test older DDL.
  globalTeardown: '<rootDir>/spec/integration/support/prepareDatabase.ts',
  coverageDirectory: 'coverage/integration',
  // The floor in jest.config.cjs guards the unit suite. This suite exercises
  // different code paths, so inheriting it would fail on numbers that were
  // never meant for it. It gets its own floor once its coverage is stable.
  coverageThreshold: {},
  // Every file uses the same database, so they must not run concurrently.
  maxWorkers: 1,
  // Some scenarios wait on purpose, for a lock or for the relay.
  testTimeout: 30000,
};
