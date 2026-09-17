/**
 * Runs before every unit spec (setupFiles in jest.config.cjs).
 *
 * Unit tests never talk to MySQL. The MYSQL_* variables exported to run
 * npm run test:integration would otherwise switch PUT /items/:id to the
 * event-driven path and break its unit test.
 */
for (const variable of Object.keys(process.env)) {
    if (variable.startsWith('MYSQL_')) delete process.env[variable];
}

export {};
