/**
 * Runs before every integration spec (setupFiles in
 * jest.integration.config.cjs), before any application module is loaded.
 *
 * The suites delete every row of the tables they use, so they only accept a
 * database whose name ends with "_test". They also refuse the *_FILE variables:
 * the event-driven pool ignores them, so the application's two pools could end
 * up on different databases.
 */
export const TEST_DATABASE_NAME = /_test$/;

const missing = ['MYSQL_HOST', 'MYSQL_USER', 'MYSQL_DB'].filter(name => !process.env[name]);
if (process.env.MYSQL_PASSWORD === undefined) missing.push('MYSQL_PASSWORD');
if (missing.length > 0) {
    throw new Error(
        `Integration tests need a MySQL server: set ${missing.join(', ')} (see jest.integration.config.cjs).`,
    );
}

const database = String(process.env.MYSQL_DB);
if (!TEST_DATABASE_NAME.test(database)) {
    throw new Error(
        `Refusing to run against database "${database}": integration tests delete every row of ` +
            'the tables they use, so the database name must end with "_test".',
    );
}

const fileVariables = Object.keys(process.env).filter(name => /^MYSQL_\w+_FILE$/.test(name));
if (fileVariables.length > 0) {
    throw new Error(
        `Unset ${fileVariables.join(', ')}: integration tests only use the plain MYSQL_* variables.`,
    );
}
