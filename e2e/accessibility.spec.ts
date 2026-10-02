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

    /** Creates a task in a project of the user's: the board shows no other task. */
    async function boardTask(page: Page, name: string, priorisation: 'high' | 'medium' | 'low') {
        const created = await page.request.post('/items', {
            data: { name, deadline: '2026-10-02', priorisation, status: 'todo' },
        });
        expect(created.ok()).toBe(true);
        const { user } = await (await page.request.get('/auth/me')).json();
        const { project } = await (await page.request.post('/projects', { data: { name: 'Audit' } })).json();
        const linked = await page.request.post(`/projects/${project.id}/items`, {
            data: { taskKey: Number((await created.json()).id), userId: user.id },
        });
        expect(linked.ok()).toBe(true);
    }

    test('the board conforms with tasks of every priority in it', async ({ page }) => {
        await boardTask(page, 'Write the accessibility statement', 'high');
        await boardTask(page, 'Review the audit grid', 'medium');
        await boardTask(page, 'Rehearse the demo', 'low');
        await page.goto('/todos');
        await expect(page.getByRole('heading', { level: 4, name: 'Review the audit grid' })).toBeVisible();
        await expect(page.getByText('Priority: medium')).toBeVisible();
        await expectNoViolations(page);
    });

    test('a card moves between columns from the keyboard, and the move is announced', async ({ page }) => {
        await boardTask(page, 'Write the accessibility statement', 'high');
        await page.goto('/todos');
        const inProgress = page.getByRole('region', { name: /^In progress/ });
        await expect(inProgress.getByRole('listitem')).toHaveCount(0);

        await page.getByRole('combobox', { name: 'Status of Write the accessibility statement' }).focus();
        await page.keyboard.press('Enter');
        await page.getByRole('option', { name: 'In progress' }).press('Enter');

        await expect(inProgress.getByRole('heading', { name: 'Write the accessibility statement' })).toBeVisible();
        await expect(page.getByRole('status').filter({ hasText: 'moved to In progress' })).toBeAttached();
        await expectNoViolations(page);
    });

    test('the add task dialog is a named dialog that fits a 320 px screen', async ({ page }) => {
        await page.request.post('/projects', { data: { name: 'Audit' } });
        await page.setViewportSize({ width: 320, height: 640 });
        await page.goto('/todos');
        await page.getByRole('button', { name: 'Add a task' }).click();
        const dialog = page.getByRole('dialog', { name: 'Add a task' });
        await expect(dialog).toBeVisible();
        await expect(dialog.getByLabel(/^Name/)).toBeFocused();
        const box = await dialog.boundingBox();
        expect(box && box.x >= 0 && box.x + box.width <= 320).toBe(true);
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

    test('the notification bell opens a named dialog and gives the focus back', async ({ page }) => {
        await page.goto('/');
        const bell = page.getByRole('button', { name: 'Notifications' });
        await bell.click();
        const dialog = page.getByRole('dialog', { name: 'Notifications' });
        await expect(dialog).toBeVisible();
        await expect(dialog.getByText('No notifications yet')).toBeVisible();
        await expectNoViolations(page);
        await page.keyboard.press('Escape');
        await expect(dialog).toBeHidden();
        await expect(bell).toBeFocused();
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
