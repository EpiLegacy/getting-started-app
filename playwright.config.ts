import { defineConfig, devices } from '@playwright/test';

/**
 * Accessibility checks in a real browser: npm run test:a11y.
 *
 * They need the application built (npm run build, tsc -p tsconfig.build.json)
 * and a migrated MySQL database: sign-up and every page behind it go through
 * the real API. The Accessibility job in .github/workflows/ci.yml does both.
 */
export default defineConfig({
    testDir: './e2e',
    fullyParallel: false,
    forbidOnly: !!process.env.CI,
    reporter: process.env.CI ? [['list'], ['html', { open: 'never', outputFolder: 'playwright-report' }]] : 'list',
    use: {
        baseURL: process.env.A11Y_BASE_URL ?? 'http://127.0.0.1:3000',
        trace: 'retain-on-failure',
        // Transitions are instant under the theme's reduced-motion rule, so
        // axe never measures a colour halfway through an animation.
        reducedMotion: 'reduce',
    },
    projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
    webServer: process.env.A11Y_BASE_URL ? undefined : {
        command: 'node build/index.js',
        url: 'http://127.0.0.1:3000/health',
        reuseExistingServer: !process.env.CI,
        timeout: 60_000,
        stdout: 'pipe',
    },
});
