import { randomUUID } from 'node:crypto';
import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

/**
 * Automated part of the RGAA audit (docs/accessibility.md). axe-core covers
 * the WCAG 2.1 A and AA rules RGAA 4.1 is built on: contrast, names, labels,
 * landmarks, headings, language, ARIA. It cannot judge relevance (is this
 * label meaningful?), which the manual grid in the documentation covers.
 */
const WCAG = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'];

async function expectNoViolations(page: Page) {
    const { violations } = await new AxeBuilder({ page }).withTags(WCAG).analyze();
    const summary = violations.map(v => `${v.id} (${v.impact}): ${v.help}\n${v.nodes
        .map(n => `  ${n.target.join(' ')} ${n.html}\n    ${n.failureSummary?.replace(/\n/g, ' ')}`).join('\n')}`);
    expect(summary, summary.join('\n')).toEqual([]);
}

async function signUp(page: Page) {
    await page.goto('/register');
    await page.getByLabel('Email').fill(`a11y-${randomUUID()}@example.com`);
    await page.getByLabel('Password').fill('correct horse battery staple');
    await page.getByRole('button', { name: 'Create an account' }).click();
    await expect(page).toHaveURL(/\/todos$/);
}

test.describe('anonymous pages', () => {
    for (const [path, title] of [
        ['/login', 'Sign in'],
        ['/register', 'Create an account'],
        ['/accessibility', 'Accessibility statement'],
        ['/sitemap', 'Site map'],
    ]) {
        test(`${path} has no WCAG A/AA violation`, async ({ page }) => {
            await page.goto(path);
            await expect(page).toHaveTitle(`${title} - Todo App`);
            await expectNoViolations(page);
        });
    }

    test('a failed sign-in is announced and still conforms', async ({ page }) => {
        await page.goto('/login');
        await page.getByLabel('Email').fill('nobody@example.com');
        await page.getByLabel('Password').fill('wrong password');
        await page.getByRole('button', { name: 'Sign in' }).click();
        await expect(page.getByRole('alert')).toBeVisible();
        await expectNoViolations(page);
    });
});

test.describe('signed-in pages', () => {
    test.beforeEach(async ({ page }) => signUp(page));

    for (const [path, title] of [
        ['/', 'Home'],
        ['/todos', 'My tasks'],
        ['/profile', 'Your profile'],
        ['/does-not-exist', 'Page not found'],
    ]) {
        test(`${path} has no WCAG A/AA violation`, async ({ page }) => {
            await page.goto(path);
            await expect(page).toHaveTitle(`${title} - Todo App`);
            await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
            await expectNoViolations(page);
        });
    }

    test('the task list conforms with tasks in it', async ({ page }) => {
        const created = await page.request.post('/items', {
            data: { name: 'Write the accessibility statement', deadline: '2026-10-02', priorisation: 'high', status: 'todo' },
        });
        expect(created.ok()).toBe(true);
        // The board only shows tasks that belong to one of the user's projects.
        const { user } = await (await page.request.get('/auth/me')).json();
        const { project } = await (await page.request.post('/projects', { data: { name: 'Audit' } })).json();
        const linked = await page.request.post(`/projects/${project.id}/items`, {
            data: { taskKey: Number((await created.json()).id), userId: user.id },
        });
        expect(linked.ok()).toBe(true);
        await page.goto('/todos');
        await expect(page.getByText('Write the accessibility statement', { exact: true })).toBeVisible();
        await expectNoViolations(page);
    });

    test('signed-in pages reflow at 320 px without horizontal scrolling', async ({ page }) => {
        await page.setViewportSize({ width: 320, height: 640 });
        for (const path of ['/', '/todos', '/profile']) {
            await page.goto(path);
            await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
            const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
            expect(overflow, path).toBeLessThanOrEqual(0);
        }
    });

    test('the account deletion dialog conforms', async ({ page }) => {
        await page.goto('/profile');
        await page.getByRole('button', { name: 'Delete my account' }).click();
        await expect(page.getByRole('dialog')).toBeVisible();
        await expectNoViolations(page);
    });
});

test.describe('keyboard', () => {
    test('the first tab stop skips to the main content', async ({ page }) => {
        await page.goto('/login');
        await page.keyboard.press('Tab');
        const skip = page.getByRole('link', { name: 'Skip to main content' });
        await expect(skip).toBeFocused();
        await expect(skip).toBeInViewport();
        await page.keyboard.press('Enter');
        await expect(page.locator('main')).toBeFocused();
    });

    test('client-side navigation moves the focus to the new page', async ({ page }) => {
        await page.goto('/login');
        await page.getByRole('link', { name: 'Accessibility: partially compliant' }).click();
        await expect(page).toHaveTitle('Accessibility statement - Todo App');
        await expect(page.locator('main')).toBeFocused();
    });

    test('focused controls show a visible ring', async ({ page }) => {
        await page.goto('/login');
        await page.getByLabel('Password').focus();
        await page.keyboard.press('Tab');
        const outline = await page.evaluate(() => getComputedStyle(document.activeElement as Element).outlineStyle);
        expect(outline).toBe('solid');
    });
});

test('every page reflows at 320 px without horizontal scrolling', async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 640 });
    for (const path of ['/login', '/register', '/accessibility', '/sitemap']) {
        await page.goto(path);
        await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
        const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
        expect(overflow, path).toBeLessThanOrEqual(0);
    }
});

test('the page can be zoomed', async ({ page }) => {
    await page.goto('/login');
    const viewport = await page.locator('meta[name="viewport"]').getAttribute('content');
    expect(viewport).not.toMatch(/user-scalable\s*=\s*(no|0)|maximum-scale/);
});
