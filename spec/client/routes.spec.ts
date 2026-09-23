import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { StaticRouter } from 'react-router';
import App from '../../src/client/app/App';
import { useAuth } from '../../src/client/features/auth/AuthProvider';

jest.mock('../../src/client/features/auth/AuthProvider', () => ({
    ...jest.requireActual('../../src/client/features/auth/AuthProvider'),
    useAuth: jest.fn(),
}));

beforeEach(() => {
    jest.mocked(useAuth).mockReturnValue({
        user: { id: 'alice', email: 'alice@example.com' }, loading: false, error: '',
        signIn: jest.fn(), logout: jest.fn(), retry: jest.fn(),
    });
});

jest.mock('../../src/client/features/todos/todos.css', () => ({}));

function renderRoute(location: string) {
    return renderToStaticMarkup(
        React.createElement(StaticRouter, { location }, React.createElement(App)),
    );
}

describe('frontend routes', () => {
    it('renders the dashboard and marks Home as the current page', () => {
        const html = renderRoute('/');
        expect(html).toContain('Welcome back!');
        expect(html).toMatch(/aria-current="page"[^>]*href="\/"/);
        expect(html).toContain('href="/todos"');
    });

    it('renders the todo list and marks Todos as the current page', () => {
        const html = renderRoute('/todos');
        expect(html).toContain('My tasks');
        expect(html).toMatch(/aria-current="page"[^>]*href="\/todos"/);
        expect(html).not.toContain('Welcome back!');
    });

    it('renders unknown nested paths inside the shared layout', () => {
        const html = renderRoute('/missing/nested');
        expect(html).toContain('Page not found');
        expect(html).toContain('Main navigation');
        expect(html).not.toContain('aria-current="page"');
        expect(html).toContain('Back to home');
    });
});

for (const path of ['/login', '/register']) {
    test(`renders ${path} for anonymous users`, () => {
        jest.mocked(useAuth).mockReturnValue({
            user: null, loading: false, error: '', signIn: jest.fn(), logout: jest.fn(), retry: jest.fn(),
        });
        const html = renderRoute(path);
        expect(html).toContain('type="password"');
        expect(html).toContain('type="email"');
        expect(html).not.toContain('My tasks');
    });
}

test('does not show tasks while the session is being checked', () => {
    jest.mocked(useAuth).mockReturnValue({
        user: null, loading: true, error: '', signIn: jest.fn(), logout: jest.fn(), retry: jest.fn(),
    });
    const html = renderRoute('/todos');
    expect(html).toContain('Checking your session');
    expect(html).not.toContain('Unassigned tasks');
});
